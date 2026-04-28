import os
import logging
from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django.http import HttpResponseRedirect
from django.conf import settings
from .models import CallLog, MeetingPlatformConfig
from .serializers import CallLogSerializer, MeetingPlatformConfigSerializer

logger = logging.getLogger(__name__)

# Allow OAuth over HTTP for localhost development
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

GOOGLE_REDIRECT_URI = 'http://localhost:8000/api/meetings/google-oauth-callback/'


from notifications.helpers import notify


class CallLogViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = CallLogSerializer
    filterset_fields = ['client', 'user', 'status']

    def get_queryset(self):
        return CallLog.objects.select_related('client', 'user', 'contact').all()

    def perform_create(self, serializer):
        meeting = serializer.save(user=self.request.user)
        notify(
            title=f'Meeting scheduled: {meeting.agenda or meeting.client.company_name}',
            message=f'{self.request.user.full_name} scheduled a meeting with {meeting.client.company_name}.',
            notification_type='task', link='/meetings',
            actor=self.request.user, client=meeting.client,
        )

    @action(detail=True, methods=['post'], url_path='generate-link')
    def generate_link(self, request, pk=None):
        """Auto-generate a meeting link via platform API."""
        meeting = self.get_object()

        if meeting.meeting_link:
            return Response({'meeting_link': meeting.meeting_link, 'message': 'Link already exists'})

        platform = meeting.platform
        platform_key = 'google' if platform == 'google_meet' else platform

        config = MeetingPlatformConfig.objects.filter(
            platform=platform_key, is_active=True
        ).first()

        if not config:
            return Response(
                {'error': f'No active {platform} config found. Go to Settings > Meeting Platforms to configure.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        topic = meeting.agenda or f'Meeting with {meeting.client.company_name}'
        duration = meeting.duration_minutes or 60

        try:
            if platform == 'zoom':
                from .services import ZoomService
                result = ZoomService.create_meeting(config, topic, meeting.scheduled_at, duration)
            elif platform == 'google_meet':
                if not config.google_refresh_token:
                    return Response(
                        {'error': 'Google account not connected. Go to Settings > Meeting Platforms and click "Connect Google Account".'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                from .services import GoogleMeetService
                # Get client contact emails so they can join without knocking
                attendee_emails = list(
                    meeting.client.contacts.filter(is_deleted=False)
                    .exclude(email='')
                    .values_list('email', flat=True)
                )
                result = GoogleMeetService.create_meeting(
                    config, topic, meeting.scheduled_at, duration,
                    attendee_emails=attendee_emails
                )
            else:
                return Response(
                    {'error': f'Auto-generation not supported for {platform}. Paste the link manually.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            meeting.meeting_link = result.get('join_url', '')
            meeting.save(update_fields=['meeting_link'])

            # Build a draft email payload — the frontend opens a modal with
            # this content so the user can review, edit recipients, and choose
            # when to send.
            from clients.models import Contact as ClientContact
            primary = ClientContact.objects.filter(
                client=meeting.client, is_deleted=False, is_primary=True,
            ).first() or ClientContact.objects.filter(client=meeting.client, is_deleted=False).first()
            to_email = primary.email if primary and primary.email else ''
            cc_emails = list(
                ClientContact.objects.filter(client=meeting.client, is_deleted=False)
                .exclude(email='').exclude(id=primary.id if primary else None)
                .values_list('email', flat=True)
            )
            scheduled = meeting.scheduled_at.strftime('%B %d, %Y at %I:%M %p')
            platform_name = meeting.get_platform_display()
            body_html = f"""
            <p>Dear {primary.name if primary and primary.name else 'Sir/Madam'},</p>
            <p>You are invited to a meeting with <strong>Kriya Biosys Private Limited</strong>.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr><td style="padding: 8px; color: #666; width: 120px;">Subject</td><td style="padding: 8px; font-weight: bold;">{topic}</td></tr>
                <tr style="background: #f9f9f9;"><td style="padding: 8px; color: #666;">Date &amp; Time</td><td style="padding: 8px;">{scheduled}</td></tr>
                <tr><td style="padding: 8px; color: #666;">Duration</td><td style="padding: 8px;">{duration} minutes</td></tr>
                <tr style="background: #f9f9f9;"><td style="padding: 8px; color: #666;">Platform</td><td style="padding: 8px;">{platform_name}</td></tr>
            </table>
            <p style="margin: 24px 0;">
                <a href="{meeting.meeting_link}" style="background: #1a73e8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Join Meeting</a>
            </p>
            <p style="color: #666; font-size: 13px;">Meeting link: <a href="{meeting.meeting_link}">{meeting.meeting_link}</a></p>
            {f'<p style="color: #666; font-size: 13px;">Agenda: {meeting.agenda}</p>' if meeting.agenda else ''}
            <p>Best regards,<br/>{getattr(request.user, 'full_name', '') or request.user.username}</p>
            """
            return Response({
                'meeting_link': meeting.meeting_link,
                'email_sent': False,
                'draft': {
                    'subject': f'Meeting Invitation: {topic} - {scheduled}',
                    'to': to_email,
                    'cc': cc_emails,
                    'body_html': body_html,
                },
                'details': result,
            })

        except Exception as e:
            logger.error(f'Failed to generate meeting link: {e}')
            err_text = str(e)
            # invalid_grant -> the stored refresh token is dead (user revoked
            # access, password changed, or token expired after long inactivity).
            # Wipe the stale token so reconnection from Settings works cleanly,
            # and return a friendly message instead of the raw OAuth error.
            if 'invalid_grant' in err_text:
                try:
                    if config and config.platform == 'google' and config.google_refresh_token:
                        config.google_refresh_token = ''
                        config.save(update_fields=['google_refresh_token'])
                except Exception:
                    pass
                return Response(
                    {'error': 'Google account session has expired. Go to Settings → Meeting Platforms and click "Connect Google Account" to re-authorize.',
                     'reconnect_required': True},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            return Response(
                {'error': f'Failed to create meeting: {err_text}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


    @action(detail=True, methods=['post'], url_path='send-invite')
    def send_invite(self, request, pk=None):
        """Send the meeting-invite email after the user reviews/edits the draft.
        Body should contain: subject, to, cc (list or comma-separated string),
        and body_html.
        """
        meeting = self.get_object()
        if not meeting.meeting_link:
            return Response({'error': 'Generate the meeting link first.'}, status=status.HTTP_400_BAD_REQUEST)

        subject = (request.data.get('subject') or '').strip()
        body_html = request.data.get('body_html') or request.data.get('body') or ''
        to_email = (request.data.get('to') or '').strip()
        cc_raw = request.data.get('cc') or []
        if isinstance(cc_raw, str):
            cc_list = [e.strip() for e in cc_raw.split(',') if e.strip()]
        else:
            cc_list = [str(e).strip() for e in cc_raw if str(e).strip()]

        if not to_email:
            return Response({'error': 'Recipient email is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not subject:
            return Response({'error': 'Subject is required.'}, status=status.HTTP_400_BAD_REQUEST)

        from communications.models import EmailAccount
        email_account = EmailAccount.objects.filter(user=request.user, is_active=True).first()
        if not email_account:
            return Response({'error': 'No active email account configured for your user.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            from communications.services import EmailService
            EmailService.send_email(
                email_account=email_account,
                to=to_email,
                subject=subject,
                body_html=body_html,
                cc=cc_list or None,
            )
            from communications.models import Communication
            from clients.models import Contact as ClientContact
            primary = ClientContact.objects.filter(client=meeting.client, email=to_email).first()
            Communication.objects.create(
                client=meeting.client,
                contact=primary,
                user=request.user,
                comm_type='email',
                direction='outbound',
                subject=subject,
                body=body_html,
                status='sent',
                email_account=email_account,
                external_email=to_email,
            )
            logger.info(f'Meeting invite sent to {to_email} (cc={cc_list})')
            return Response({'sent': True, 'to': to_email, 'cc': cc_list})
        except Exception as e:
            logger.exception(f'Failed to send meeting invite: {e}')
            return Response({'error': f'Failed to send: {e}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MeetingPlatformConfigViewSet(viewsets.ModelViewSet):
    serializer_class = MeetingPlatformConfigSerializer

    def get_queryset(self):
        return MeetingPlatformConfig.objects.all()

    @action(detail=True, methods=['post'], url_path='google-auth-url')
    def google_auth_url(self, request, pk=None):
        """Generate the Google OAuth authorization URL."""
        config = self.get_object()
        if config.platform != 'google':
            return Response({'error': 'Not a Google config'}, status=status.HTTP_400_BAD_REQUEST)

        if not config.google_client_id or not config.google_client_secret:
            return Response({'error': 'Client ID and Secret are required'}, status=status.HTTP_400_BAD_REQUEST)

        from .services import GoogleMeetService
        auth_url, state = GoogleMeetService.get_auth_url(config, GOOGLE_REDIRECT_URI)
        return Response({'auth_url': auth_url, 'state': state})


from rest_framework.permissions import AllowAny

@api_view(['GET'])
@permission_classes([AllowAny])
def google_oauth_callback(request):
    """Handle Google OAuth callback — exchange code for tokens."""
    code = request.query_params.get('code')
    error = request.query_params.get('error')

    if error:
        return HttpResponseRedirect(f'http://localhost:3000/settings?google_error={error}')

    if not code:
        return HttpResponseRedirect('http://localhost:3000/settings?google_error=no_code')

    # Find the Google config
    config = MeetingPlatformConfig.objects.filter(platform='google', is_active=True).first()
    if not config:
        return HttpResponseRedirect('http://localhost:3000/settings?google_error=no_config')

    try:
        from .services import GoogleMeetService
        tokens = GoogleMeetService.exchange_code(config, code, GOOGLE_REDIRECT_URI)

        # Store the refresh token
        from common.encryption import encrypt_value
        config.google_refresh_token = encrypt_value(tokens['refresh_token'])
        config.save(update_fields=['google_refresh_token'])

        # Get user email
        import requests as http_requests
        user_info = http_requests.get(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            headers={'Authorization': f'Bearer {tokens["access_token"]}'},
        ).json()
        config.google_user_email = user_info.get('email', '')
        config.save(update_fields=['google_user_email'])

        return HttpResponseRedirect('http://localhost:3000/settings?google_connected=true')

    except Exception as e:
        logger.error(f'Google OAuth callback error: {e}')
        return HttpResponseRedirect(f'http://localhost:3000/settings?google_error={str(e)[:100]}')
