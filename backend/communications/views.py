import logging

from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Communication, EmailAccount, WhatsAppConfig, EmailDraft, QuoteRequest
from .serializers import (
    CommunicationSerializer,
    EmailAccountSerializer,
    WhatsAppConfigSerializer,
    SendEmailSerializer,
    SendWhatsAppSerializer,
    EmailDraftSerializer,
    QuoteRequestSerializer,
)
from .services import EmailService, WhatsAppService, ContactMatcher

logger = logging.getLogger(__name__)


def _auto_create_contact(client, communication):
    """Auto-create a contact for the client if the sender's email/phone doesn't exist yet."""
    from clients.models import Contact

    email = communication.external_email or ''
    phone = communication.external_phone or ''

    if not email and not phone:
        return None

    # Check if contact already exists
    if email:
        existing = Contact.objects.filter(client=client, email__iexact=email, is_deleted=False).first()
        if existing:
            return existing
    if phone:
        existing = Contact.objects.filter(client=client, phone=phone, is_deleted=False).first()
        if existing:
            return existing

    # Extract a name from the email address
    name = ''
    if email and '@' in email:
        local = email.split('@')[0]
        # Convert "john.doe" or "john_doe" to "John Doe"
        name = local.replace('.', ' ').replace('_', ' ').replace('-', ' ').title()

    # Check if client has any contacts at all
    has_contacts = Contact.objects.filter(client=client, is_deleted=False).exists()

    contact = Contact.objects.create(
        client=client,
        name=name or email or phone,
        email=email,
        phone=phone,
        is_primary=not has_contacts,  # First contact is primary
    )

    # Link contact to communication if not already linked
    if not communication.contact:
        communication.contact = contact
        communication.save(update_fields=['contact'])

    return contact


class CommunicationViewSet(viewsets.ModelViewSet):
    serializer_class = CommunicationSerializer
    filterset_fields = ['client', 'comm_type', 'direction', 'is_follow_up_required',
                        'is_client_mail', 'classification']
    search_fields = ['subject', 'body']
    ordering_fields = ['created_at']

    def get_queryset(self):
        qs = Communication.objects.filter(is_deleted=False).select_related(
            'user', 'contact', 'client', 'client__primary_executive',
        ).prefetch_related('attachments')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(Q(client__in=client_ids) | Q(client__isnull=True, user=user))
        return qs.all()

    def perform_create(self, serializer):
        comm = serializer.save(user=self.request.user)
        if comm.client:
            comm.client.save(update_fields=['updated_at'])

    @action(detail=True, methods=['get'], url_path='thread')
    def thread(self, request, pk=None):
        """Get the full email thread for this communication."""
        comm = self.get_object()

        # Mark as read on open
        if not comm.is_read:
            comm.is_read = True
            comm.save(update_fields=['is_read'])

        thread_messages = [comm]

        if comm.comm_type == 'email' and (comm.email_message_id or comm.email_in_reply_to):
            # Collect all message IDs and in-reply-to chains
            seen_ids = {str(comm.id)}
            message_ids = set()
            if comm.email_message_id:
                message_ids.add(comm.email_message_id)
            if comm.email_in_reply_to:
                message_ids.add(comm.email_in_reply_to)

            # Also match by subject thread (Re: / Fwd:)
            base_subject = comm.subject or ''
            for prefix in ['Re: ', 'RE: ', 'Fwd: ', 'FWD: ', 'Fw: ']:
                if base_subject.startswith(prefix):
                    base_subject = base_subject[len(prefix):]

            # Fetch related emails by message-id chain + subject match
            related = Communication.objects.filter(
                is_deleted=False,
                comm_type='email',
            ).filter(
                Q(email_message_id__in=message_ids) |
                Q(email_in_reply_to__in=message_ids) |
                Q(email_in_reply_to=comm.email_message_id) |
                (Q(client=comm.client, external_email=comm.external_email, subject__icontains=base_subject) if base_subject and comm.client else Q())
            ).exclude(id=comm.id).order_by('created_at')

            for msg in related:
                if str(msg.id) not in seen_ids:
                    seen_ids.add(str(msg.id))
                    thread_messages.append(msg)
                    # Follow the chain further
                    if msg.email_message_id:
                        message_ids.add(msg.email_message_id)

            # Second pass for deeper threads
            if len(message_ids) > 2:
                deeper = Communication.objects.filter(
                    is_deleted=False, comm_type='email',
                ).filter(
                    Q(email_message_id__in=message_ids) | Q(email_in_reply_to__in=message_ids)
                ).order_by('created_at')
                for msg in deeper:
                    if str(msg.id) not in seen_ids:
                        seen_ids.add(str(msg.id))
                        thread_messages.append(msg)

        # Sort by date ascending (oldest first)
        thread_messages.sort(key=lambda m: m.created_at)

        return Response({
            'communication': CommunicationSerializer(comm).data,
            'thread': CommunicationSerializer(thread_messages, many=True).data,
            'thread_count': len(thread_messages),
        })

    @action(detail=True, methods=['post'], url_path='mark-read')
    def mark_read(self, request, pk=None):
        """Mark a communication as read."""
        comm = self.get_object()
        comm.is_read = True
        comm.save(update_fields=['is_read'])
        return Response({'is_read': True})

    @action(detail=True, methods=['post'], url_path='mark-unread')
    def mark_unread(self, request, pk=None):
        """Mark a communication as unread."""
        comm = self.get_object()
        comm.is_read = False
        comm.save(update_fields=['is_read'])
        return Response({'is_read': False})

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        """Mark all communications as read."""
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'status': 'all marked as read'})

    @action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, pk=None):
        """Archive a communication. Optionally auto-archive all future emails from this sender."""
        comm = self.get_object()
        archive_sender = request.data.get('archive_sender', False)

        # Soft-delete this communication
        comm.soft_delete()

        if archive_sender and comm.external_email:
            from .models import ArchivedSender
            # Create auto-archive rule (if not already exists)
            ArchivedSender.objects.get_or_create(
                email__iexact=comm.external_email,
                defaults={
                    'email': comm.external_email.lower(),
                    'archived_by': request.user,
                }
            )
            # Also archive all existing emails from this sender
            existing = Communication.objects.filter(
                external_email__iexact=comm.external_email,
                is_deleted=False,
            ).exclude(id=comm.id)
            count = 0
            for c in existing:
                c.soft_delete()
                count += 1

            return Response({
                'status': 'archived',
                'sender_archived': True,
                'existing_archived': count,
                'sender_email': comm.external_email,
            })

        return Response({'status': 'archived', 'sender_archived': False})

    @action(detail=False, methods=['get'], url_path='archived-senders')
    def archived_senders(self, request):
        """List all auto-archived senders."""
        from .models import ArchivedSender
        senders = ArchivedSender.objects.all().values('id', 'email', 'archived_by__full_name', 'created_at')
        # full_name is a property, need to get it differently
        senders_list = []
        for s in ArchivedSender.objects.select_related('archived_by').all():
            senders_list.append({
                'id': str(s.id),
                'email': s.email,
                'archived_by': s.archived_by.full_name if s.archived_by else '',
                'created_at': s.created_at.isoformat(),
            })
        return Response(senders_list)

    @action(detail=False, methods=['post'], url_path='unarchive-sender')
    def unarchive_sender(self, request):
        """Remove a sender from auto-archive list."""
        from .models import ArchivedSender
        sender_id = request.data.get('id')
        email = request.data.get('email', '').strip().lower()

        if sender_id:
            ArchivedSender.objects.filter(id=sender_id).delete()
        elif email:
            ArchivedSender.objects.filter(email__iexact=email).delete()
        else:
            return Response({'error': 'id or email required'}, status=status.HTTP_400_BAD_REQUEST)

        return Response({'status': 'sender unarchived'})

    @action(detail=True, methods=['post'], url_path='mark-as-client')
    def mark_as_client(self, request, pk=None):
        """Mark an unmatched communication as client mail and assign to a client."""
        comm = self.get_object()
        client_id = request.data.get('client')
        if not client_id:
            return Response({'error': 'client id is required'}, status=status.HTTP_400_BAD_REQUEST)

        from clients.models import Client
        try:
            client = Client.objects.get(id=client_id, is_deleted=False)
        except Client.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)

        comm.client = client
        comm.is_client_mail = True
        comm.classification = 'client'
        comm.is_classified = True
        comm.save(update_fields=['client', 'is_client_mail', 'classification', 'is_classified'])

        # Auto-create contact if sender email doesn't exist as a contact
        _auto_create_contact(client, comm)

        return Response(CommunicationSerializer(comm).data)

    @action(detail=True, methods=['post'], url_path='reclassify')
    def reclassify(self, request, pk=None):
        """Re-run classification on a communication."""
        comm = self.get_object()
        from .email_classifier import reclassify_communication
        result = reclassify_communication(comm)
        return Response({
            'is_client_mail': result['is_client_mail'],
            'classification': result['classification'],
        })

    @action(detail=False, methods=['get'], url_path='classification-counts')
    def classification_counts(self, request):
        """Return counts of non-client emails grouped by classification."""
        from django.db.models import Count
        qs = self.get_queryset().filter(is_client_mail=False)
        counts = qs.values('classification').annotate(count=Count('id'))
        result = {item['classification']: item['count'] for item in counts}
        total = sum(result.values())
        result['total'] = total
        return Response(result)


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
        """Trigger email sync + pipeline automation directly."""
        account = self.get_object()
        from .tasks import sync_emails
        try:
            result = sync_emails(email_account_id=str(account.id))
            # Also run pipeline automation after sync
            try:
                from workflows.tasks import auto_pipeline_from_emails
                auto_pipeline_from_emails()
            except Exception:
                pass
            return Response({'status': result}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class EmailDraftViewSet(viewsets.ModelViewSet):
    serializer_class = EmailDraftSerializer
    filterset_fields = ['client', 'status']

    def get_queryset(self):
        qs = EmailDraft.objects.filter(is_deleted=False).select_related('client', 'communication')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(Q(client__in=client_ids) | Q(created_by=user))
        return qs

    def perform_update(self, serializer):
        serializer.save(edited_by=self.request.user)

    @action(detail=True, methods=['post'])
    def send(self, request, pk=None):
        """Send the draft email to the client."""
        draft = self.get_object()

        if draft.status != 'draft':
            return Response({'error': 'Only drafts can be sent'}, status=status.HTTP_400_BAD_REQUEST)
        if not draft.body.strip():
            return Response({'error': 'Email body cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
        if not draft.subject.strip():
            return Response({'error': 'Subject is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not draft.to_email:
            return Response({'error': 'Recipient email is required'}, status=status.HTTP_400_BAD_REQUEST)

        # Get email account
        email_account = EmailAccount.objects.filter(user=request.user, is_active=True).first()
        if not email_account:
            email_account = EmailAccount.objects.filter(is_active=True).first()
        if not email_account:
            return Response({'error': 'No email account configured'}, status=status.HTTP_400_BAD_REQUEST)

        # Send email with CC
        try:
            EmailService.send_email(
                email_account=email_account,
                to=draft.to_email,
                subject=draft.subject,
                body_html=draft.body.replace('\n', '<br>'),
                cc=draft.cc if draft.cc else None,
            )
        except Exception as e:
            return Response({'error': f'Failed to send: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Update draft
        from django.utils import timezone
        draft.status = 'sent'
        draft.sent_at = timezone.now()
        draft.save(update_fields=['status', 'sent_at'])

        # Create outgoing Communication record
        Communication.objects.create(
            client=draft.client,
            user=request.user,
            comm_type='email',
            direction='outbound',
            subject=draft.subject,
            body=draft.body,
            status='sent',
            email_account=email_account,
            external_email=draft.to_email,
            email_in_reply_to=draft.communication.email_message_id or '',
        )

        if draft.client:
            from notifications.helpers import notify
            notify(
                title=f'Draft reply sent to {draft.to_email}',
                message=f'{request.user.full_name} sent reply: {draft.subject}',
                notification_type='system', link=f'/clients/{draft.client.id}',
                actor=request.user, client=draft.client,
            )

        return Response({'status': 'sent', 'sent_at': draft.sent_at.isoformat()})

    @action(detail=True, methods=['post'])
    def discard(self, request, pk=None):
        """Discard a draft."""
        draft = self.get_object()
        draft.status = 'discarded'
        draft.save(update_fields=['status'])
        return Response({'status': 'discarded'})

    @action(detail=True, methods=['post'])
    def regenerate(self, request, pk=None):
        """Regenerate AI draft for this email."""
        draft = self.get_object()
        from .ai_email_service import generate_email_reply
        try:
            reply = generate_email_reply(draft.communication)
            draft.subject = reply['subject']
            draft.body = reply['body']
            draft.generated_by_ai = True
            draft.save(update_fields=['subject', 'body', 'generated_by_ai'])
            return Response(EmailDraftSerializer(draft).data)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class WhatsAppConfigViewSet(viewsets.ModelViewSet):
    serializer_class = WhatsAppConfigSerializer

    def get_queryset(self):
        return WhatsAppConfig.objects.all()


class QuoteRequestViewSet(viewsets.ModelViewSet):
    def perform_destroy(self, instance):
        instance.soft_delete()

    serializer_class = QuoteRequestSerializer
    filterset_fields = ['status', 'source_channel', 'client', 'assigned_to']
    ordering_fields = ['created_at', 'ai_confidence']

    def get_queryset(self):
        qs = QuoteRequest.objects.filter(is_deleted=False).select_related(
            'client', 'contact', 'assigned_to', 'source_communication', 'linked_quotation'
        )
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(Q(client__in=client_ids) | Q(assigned_to=user))
        return qs

    @action(detail=True, methods=['post'], url_path='generate-draft-quote')
    def generate_draft_quote(self, request, pk=None):
        """Generate a draft quotation from this quote request."""
        qr = self.get_object()
        if qr.linked_quotation:
            from quotations.serializers import QuotationSerializer
            return Response(QuotationSerializer(qr.linked_quotation).data)

        from .auto_quote_service import _generate_draft_quotation
        try:
            quotation = _generate_draft_quotation(qr)
            qr.linked_quotation = quotation
            qr.status = 'converted'
            qr.save(update_fields=['linked_quotation', 'status'])
            from quotations.serializers import QuotationSerializer
            return Response(QuotationSerializer(quotation).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, pk=None):
        """Reject this quote request."""
        qr = self.get_object()
        qr.status = 'rejected'
        qr.save(update_fields=['status'])
        return Response(QuoteRequestSerializer(qr).data)

    @action(detail=True, methods=['post'], url_path='detect-quote')
    def detect_quote(self, request, pk=None):
        """Manually trigger quote detection on a communication."""
        comm_id = request.data.get('communication_id')
        if not comm_id:
            return Response({'error': 'communication_id required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            comm = Communication.objects.get(id=comm_id)
        except Communication.DoesNotExist:
            return Response({'error': 'Communication not found'}, status=status.HTTP_404_NOT_FOUND)
        from .auto_quote_service import process_communication_for_quote
        qr = process_communication_for_quote(comm)
        if qr:
            return Response(QuoteRequestSerializer(qr).data, status=status.HTTP_201_CREATED)
        return Response({'message': 'No quote intent detected'}, status=status.HTTP_200_OK)


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

    if client:
        from notifications.helpers import notify
        notify(
            title=f'Email sent to {data["to"]}',
            message=f'{request.user.full_name} sent email: {data["subject"]}',
            notification_type='system', link=f'/clients/{client.id}',
            actor=request.user, client=client,
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

    if client:
        from notifications.helpers import notify
        notify(
            title=f'WhatsApp sent to {data["to"]}',
            message=f'{request.user.full_name} sent WhatsApp message to {client.company_name}.',
            notification_type='system', link=f'/clients/{client.id}',
            actor=request.user, client=client,
        )

    return Response(
        CommunicationSerializer(comm).data,
        status=status.HTTP_201_CREATED
    )


@api_view(['POST'])
def summarize_voice_text(request):
    """Summarize raw voice transcript into a professional email body using AI."""
    raw_text = request.data.get('text', '').strip()
    context = request.data.get('context', '')  # e.g. client name, subject
    contact_name = request.data.get('contact_name', '').strip()

    if not raw_text:
        return Response({'error': 'text is required'}, status=status.HTTP_400_BAD_REQUEST)

    prompt = f"""You are a trade executive at Kriya Biosys, an organic agricultural products exporter.

Convert this voice note into a professional email body. Write naturally like a real person — warm, confident, not robotic.

Rules:
- Write 2-3 paragraphs (around 80-120 words total)
- First paragraph: address the main point from the voice note
- Second paragraph: add relevant context, next steps, or additional details
- Third paragraph (if needed): closing thought or call to action
- Preserve all specific details (products, prices, quantities, terms) exactly
- Do NOT add greeting (Dear...) or signature (Best regards...) — system handles that

{f'Context: {context}' if context else ''}

Voice note: "{raw_text}"

Email body:"""

    from .ai_email_service import _generate_with_ai
    import re as _re
    result = _generate_with_ai(prompt)

    if result:
        # Strip any greeting/sign-off AI may have added
        result = _re.sub(r'^(Dear\s+[^,\n]+,)\s*\n?', '', result, flags=_re.IGNORECASE).strip()
        result = _re.sub(
            r'\n*(Best regards|Kind regards|Warm regards|Regards|Sincerely|Thanks|Thank you),?\s*\n.*$',
            '', result, flags=_re.IGNORECASE | _re.DOTALL
        ).rstrip()
    else:
        # Fallback: just clean up the text minimally
        result = raw_text.replace('  ', ' ').strip()
        result = _re.sub(r'(^|[.!?]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), result)

    # Always wrap with greeting + sign-off
    greeting = f'Dear {contact_name},' if contact_name else ''
    parts = []
    if greeting:
        parts.append(greeting)
    parts.append(result)
    parts.append("Best regards,\nKriya Biosys Private Limited")

    return Response({'summarized': '\n\n'.join(parts)})


@api_view(['POST'])
def refine_email_text(request):
    """Refine email body: polish, formalize, elaborate, or shorten."""
    body = request.data.get('body', '').strip()
    action = request.data.get('action', '').strip()
    contact_name = request.data.get('contact_name', '').strip()

    if not body:
        return Response({'error': 'body is required'}, status=status.HTTP_400_BAD_REQUEST)
    if action not in ('polish', 'formalize', 'elaborate', 'shorten'):
        return Response({'error': 'action must be one of: polish, formalize, elaborate, shorten'}, status=status.HTTP_400_BAD_REQUEST)

    from communications.ai_email_service import refine_email_body
    result = refine_email_body(body, action, contact_name=contact_name)
    return Response({'refined': result})


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

            comm = Communication.objects.create(
                client=client,
                contact=contact,
                comm_type='whatsapp',
                direction='inbound',
                body=text,
                status='received',
                whatsapp_message_id=wa_msg_id,
                external_phone=from_phone,
            )

            # Auto-detect PI request first (takes priority)
            pi_created = False
            if client:
                try:
                    from communications.auto_pi_service import process_communication_for_pi
                    pi_result = process_communication_for_pi(comm)
                    if pi_result:
                        pi_created = True
                except Exception as pe:
                    logger.error(f'PI detection failed for WA {comm.id}: {pe}')

            # Auto-detect quote request (skip if PI was detected)
            if not pi_created:
                try:
                    from communications.auto_quote_service import process_communication_for_quote
                    process_communication_for_quote(comm)
                except Exception as qe:
                    logger.error(f'Quote request detection failed for WA {comm.id}: {qe}')

    except Exception as e:
        logger.error(f'WhatsApp webhook processing error: {e}')

    # Always return 200 to acknowledge receipt
    return Response('OK', status=status.HTTP_200_OK)
