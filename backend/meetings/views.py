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


class CallLogViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = CallLogSerializer
    filterset_fields = ['client', 'user', 'status']

    def get_queryset(self):
        return CallLog.objects.select_related('client', 'user', 'contact').all()

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

            # Send meeting invite email to client's primary contact
            email_sent = False
            try:
                from communications.models import EmailAccount
                email_account = EmailAccount.objects.filter(
                    user=request.user, is_active=True
                ).first()

                # Get client's primary contact email
                contact = meeting.client.contacts.filter(
                    is_deleted=False
                ).order_by('-is_primary', 'name').first()
                contact_email = contact.email if contact else None

                if email_account and contact_email:
                    from communications.services import EmailService
                    scheduled = meeting.scheduled_at.strftime('%B %d, %Y at %I:%M %p')
                    platform_name = meeting.get_platform_display()
                    body_html = f"""
                    <div style="font-family: Arial, sans-serif; max-width: 600px;">
                        <h2 style="color: #1e3a5f;">Meeting Invitation</h2>
                        <p>You are invited to a meeting with <strong>Kriya Global Trade</strong>.</p>
                        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                            <tr><td style="padding: 8px; color: #666; width: 120px;">Subject</td><td style="padding: 8px; font-weight: bold;">{topic}</td></tr>
                            <tr style="background: #f9f9f9;"><td style="padding: 8px; color: #666;">Date & Time</td><td style="padding: 8px;">{scheduled}</td></tr>
                            <tr><td style="padding: 8px; color: #666;">Duration</td><td style="padding: 8px;">{duration} minutes</td></tr>
                            <tr style="background: #f9f9f9;"><td style="padding: 8px; color: #666;">Platform</td><td style="padding: 8px;">{platform_name}</td></tr>
                        </table>
                        <p style="margin: 24px 0;">
                            <a href="{meeting.meeting_link}" style="background: #1a73e8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
                                Join Meeting
                            </a>
                        </p>
                        <p style="color: #666; font-size: 13px;">Meeting link: <a href="{meeting.meeting_link}">{meeting.meeting_link}</a></p>
                        {f'<p style="color: #666; font-size: 13px;">Agenda: {meeting.agenda}</p>' if meeting.agenda else ''}
                        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
                        <p style="color: #999; font-size: 12px;">Sent from Kriya CRM</p>
                    </div>
                    """
                    EmailService.send_email(
                        email_account=email_account,
                        to=contact_email,
                        subject=f'Meeting Invitation: {topic} - {scheduled}',
                        body_html=body_html,
                    )
                    email_sent = True
                    logger.info(f'Meeting invite sent to {contact_email}')

                    # Save as communication record
                    from communications.models import Communication
                    Communication.objects.create(
                        client=meeting.client,
                        contact=contact,
                        user=request.user,
                        comm_type='email',
                        direction='outbound',
                        subject=f'Meeting Invitation: {topic}',
                        body=body_html,
                        status='sent',
                        email_account=email_account,
                        external_email=contact_email,
                    )
            except Exception as e:
                logger.error(f'Failed to send meeting invite email: {e}')

            return Response({
                'meeting_link': meeting.meeting_link,
                'email_sent': email_sent,
                'details': result,
            })

        except Exception as e:
            logger.error(f'Failed to generate meeting link: {e}')
            return Response(
                {'error': f'Failed to create meeting: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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
