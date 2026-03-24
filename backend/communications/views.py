import logging

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Communication, EmailAccount, WhatsAppConfig
from .serializers import (
    CommunicationSerializer,
    EmailAccountSerializer,
    WhatsAppConfigSerializer,
    SendEmailSerializer,
    SendWhatsAppSerializer,
)
from .services import EmailService, WhatsAppService, ContactMatcher

logger = logging.getLogger(__name__)


class CommunicationViewSet(viewsets.ModelViewSet):
    serializer_class = CommunicationSerializer
    filterset_fields = ['client', 'comm_type', 'direction', 'is_follow_up_required']
    search_fields = ['subject', 'body']
    ordering_fields = ['created_at']

    def get_queryset(self):
        return Communication.objects.select_related('user', 'contact', 'client').prefetch_related('attachments').all()

    def perform_create(self, serializer):
        comm = serializer.save(user=self.request.user)
        # Update client's updated_at
        comm.client.save(update_fields=['updated_at'])


class EmailAccountViewSet(viewsets.ModelViewSet):
    serializer_class = EmailAccountSerializer

    def get_queryset(self):
        return EmailAccount.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='test-connection')
    def test_connection(self, request, pk=None):
        """Test IMAP and SMTP connection for an email account."""
        import imaplib
        import smtplib
        from common.encryption import decrypt_value

        account = self.get_object()
        password = decrypt_value(account.password)
        results = {'imap': False, 'smtp': False, 'errors': []}

        # Test IMAP
        try:
            if account.use_ssl:
                mail = imaplib.IMAP4_SSL(account.imap_host, account.imap_port)
            else:
                mail = imaplib.IMAP4(account.imap_host, account.imap_port)
            mail.login(account.username, password)
            mail.logout()
            results['imap'] = True
        except Exception as e:
            results['errors'].append(f'IMAP: {str(e)}')

        # Test SMTP
        try:
            if account.smtp_port == 465:
                server = smtplib.SMTP_SSL(account.smtp_host, account.smtp_port)
            else:
                server = smtplib.SMTP(account.smtp_host, account.smtp_port)
                server.starttls()
            server.login(account.username, password)
            server.quit()
            results['smtp'] = True
        except Exception as e:
            results['errors'].append(f'SMTP: {str(e)}')

        success = results['imap'] and results['smtp']
        return Response(results, status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='sync-now')
    def sync_now(self, request, pk=None):
        """Trigger email sync for this account — runs directly (no Celery needed)."""
        account = self.get_object()
        from .tasks import sync_emails
        try:
            # Try Celery first, fall back to direct execution
            sync_emails.delay(email_account_id=str(account.id))
            return Response({'status': 'Sync task queued'}, status=status.HTTP_202_ACCEPTED)
        except Exception:
            # Celery/Redis not running — execute synchronously
            result = sync_emails(email_account_id=str(account.id))
            return Response({'status': result}, status=status.HTTP_200_OK)


class WhatsAppConfigViewSet(viewsets.ModelViewSet):
    serializer_class = WhatsAppConfigSerializer

    def get_queryset(self):
        return WhatsAppConfig.objects.all()


@api_view(['POST'])
def send_email_view(request):
    """Send an email and create a Communication record with optional attachments."""
    serializer = SendEmailSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    try:
        account = EmailAccount.objects.get(
            id=data['email_account'], user=request.user, is_active=True
        )
    except EmailAccount.DoesNotExist:
        return Response(
            {'error': 'Email account not found or not active.'},
            status=status.HTTP_404_NOT_FOUND
        )

    # Collect attachments from request.FILES
    attachments = request.FILES.getlist('attachments')

    # Send the email
    try:
        message_id = EmailService.send_email(
            email_account=account,
            to=data['to'],
            subject=data['subject'],
            body_html=data['body'],
            cc=data.get('cc') or None,
            bcc=data.get('bcc') or None,
            attachments=attachments or None,
        )
    except Exception as e:
        return Response(
            {'error': f'Failed to send email: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    # Auto-match client
    client = None
    contact = None
    if data.get('client'):
        from clients.models import Client
        client = Client.objects.filter(id=data['client']).first()
    else:
        client, contact = ContactMatcher.match_by_email(data['to'])

    # Create Communication record
    comm = Communication.objects.create(
        client=client,
        contact=contact,
        user=request.user,
        comm_type='email',
        direction='outbound',
        subject=data['subject'],
        body=data['body'],
        status='sent',
        email_message_id=message_id,
        email_account=account,
        external_email=data['to'],
    )

    # Save attachments
    from .models import CommunicationAttachment
    for f in attachments:
        CommunicationAttachment.objects.create(
            communication=comm,
            file=f,
            filename=f.name,
            file_size=f.size,
            mime_type=f.content_type or '',
        )

    return Response(
        CommunicationSerializer(comm).data,
        status=status.HTTP_201_CREATED
    )


@api_view(['POST'])
def send_whatsapp_view(request):
    """Send a WhatsApp message and create a Communication record."""
    serializer = SendWhatsAppSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    config = WhatsAppConfig.objects.filter(is_active=True).first()
    if not config:
        return Response(
            {'error': 'No active WhatsApp configuration found.'},
            status=status.HTTP_404_NOT_FOUND
        )

    # Send the message
    try:
        wa_message_id = WhatsAppService.send_message(
            config=config,
            to_phone=data['to'],
            message_text=data['message'],
        )
    except Exception as e:
        return Response(
            {'error': f'Failed to send WhatsApp message: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    # Auto-match client
    client = None
    contact = None
    if data.get('client'):
        from clients.models import Client
        client = Client.objects.filter(id=data['client']).first()
    else:
        client, contact = ContactMatcher.match_by_phone(data['to'])

    # Create Communication record
    comm = Communication.objects.create(
        client=client,
        contact=contact,
        user=request.user,
        comm_type='whatsapp',
        direction='outbound',
        subject='',
        body=data['message'],
        status='sent',
        whatsapp_message_id=wa_message_id,
        external_phone=data['to'],
    )

    return Response(
        CommunicationSerializer(comm).data,
        status=status.HTTP_201_CREATED
    )


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def whatsapp_webhook_view(request):
    """Handle WhatsApp webhook verification (GET) and incoming messages (POST)."""
    if request.method == 'GET':
        # Webhook verification
        mode = request.query_params.get('hub.mode')
        token = request.query_params.get('hub.verify_token')
        challenge = request.query_params.get('hub.challenge')

        config = WhatsAppConfig.objects.filter(is_active=True).first()
        if mode == 'subscribe' and config and token == config.verify_token:
            return Response(int(challenge), status=status.HTTP_200_OK)
        return Response('Verification failed', status=status.HTTP_403_FORBIDDEN)

    # POST - Incoming message
    body = request.data
    try:
        entry = body.get('entry', [{}])[0]
        changes = entry.get('changes', [{}])[0]
        value = changes.get('value', {})
        messages = value.get('messages', [])

        for msg in messages:
            from_phone = msg.get('from', '')
            msg_type = msg.get('type', '')
            wa_msg_id = msg.get('id', '')

            # Dedup
            if wa_msg_id and Communication.objects.filter(whatsapp_message_id=wa_msg_id).exists():
                continue

            # Extract text
            if msg_type == 'text':
                text = msg.get('text', {}).get('body', '')
            else:
                text = f'[{msg_type} message]'

            # Match to client
            client, contact = ContactMatcher.match_by_phone(from_phone)

            Communication.objects.create(
                client=client,
                contact=contact,
                comm_type='whatsapp',
                direction='inbound',
                body=text,
                status='received',
                whatsapp_message_id=wa_msg_id,
                external_phone=from_phone,
            )
    except Exception as e:
        logger.error(f'WhatsApp webhook processing error: {e}')

    # Always return 200 to acknowledge receipt
    return Response('OK', status=status.HTTP_200_OK)
