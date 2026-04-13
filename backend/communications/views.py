import logging

from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import Communication, EmailAccount, WhatsAppConfig, EmailDraft, QuoteRequest, DraftAttachment
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

    @action(detail=True, methods=['post'], url_path='toggle-star')
    def toggle_star(self, request, pk=None):
        """Toggle the starred flag on a communication."""
        comm = self.get_object()
        comm.is_starred = not comm.is_starred
        comm.save(update_fields=['is_starred'])
        return Response({'is_starred': comm.is_starred})

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

    @action(detail=True, methods=['post'], url_path='generate-draft')
    def generate_draft(self, request, pk=None):
        """Generate (or return existing) AI draft reply for this communication.

        Used by the AI Draft auto-open flow when navigating from the PI or
        Inquiries page — if no draft exists yet for the email, one is created
        on the fly and returned so the modal can open it.
        """
        comm = self.get_object()
        existing = EmailDraft.objects.filter(communication=comm, is_deleted=False).order_by('-created_at').first()
        if existing:
            return Response(EmailDraftSerializer(existing).data)

        from .ai_email_service import generate_email_reply
        from .services import get_client_email_recipients
        try:
            reply = generate_email_reply(comm)
            cc = ''
            if comm.client:
                _to, _, cc = get_client_email_recipients(comm.client, source_communication=comm)
            draft = EmailDraft.objects.create(
                client=comm.client,
                communication=comm,
                subject=reply['subject'],
                body=reply['body'],
                to_email=comm.external_email or '',
                cc=cc,
                generated_by_ai=True,
                created_by=request.user,
            )
            return Response(EmailDraftSerializer(draft).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='generate-followup')
    def generate_followup(self, request, pk=None):
        """Generate AI-powered FOLLOW-UP content for an outbound message that
        the client hasn't responded to yet.

        Unlike generate-draft (which writes a reply to an inbound message),
        this writes a polite nudge for one of OUR sent emails. Returns the
        AI-generated subject + body — the client decides whether to save it
        as a draft or send directly.
        """
        comm = self.get_object()
        from .ai_email_service import generate_followup_email
        try:
            reply = generate_followup_email(comm)
            return Response({
                'subject': reply['subject'],
                'body': reply['body'],
            })
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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
        qs = EmailDraft.objects.filter(is_deleted=False).select_related('client', 'communication').prefetch_related('attachments')
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
        import re as _re
        import logging as _logging
        _log = _logging.getLogger(__name__)

        draft = self.get_object()

        if draft.status != 'draft':
            return Response({'error': 'Only drafts can be sent'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate body — strip HTML tags to check there's actual content
        plain_body = _re.sub(r'<[^>]+>', '', draft.body or '').strip()
        if not plain_body:
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
            return Response({'error': 'No email account configured. Add one in Settings → Email Accounts.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Collect saved attachments from DraftAttachment
        from io import BytesIO
        attachments = []
        for att in draft.attachments.all():
            if att.file:
                try:
                    f = BytesIO(att.file.read())
                    f.name = att.filename
                    attachments.append(f)
                except Exception as e:
                    _log.warning(f'Could not read attachment {att.filename}: {e}')

        # Convert any legacy markdown-style content (**bold**, plain newlines) into
        # HTML so the recipient sees real bold text, not literal asterisks.
        from .ai_email_service import _markdown_to_html
        from .signature import append_signature
        outgoing_html = _markdown_to_html(draft.body)
        # Append the executive's per-user signature block (Thanks and Regards,
        # name, logo, contact info). Replaces any previous signature so we
        # never end up with two sign-offs.
        outgoing_html = append_signature(outgoing_html, request.user)

        # Clean CC: strip whitespace, drop empty/invalid entries
        cc_clean = ''
        if draft.cc:
            cc_parts = [c.strip() for c in draft.cc.split(',') if c.strip() and '@' in c]
            cc_clean = ','.join(cc_parts)

        # Send email with CC and attachments
        try:
            EmailService.send_email(
                email_account=email_account,
                to=draft.to_email.strip(),
                subject=draft.subject,
                body_html=outgoing_html,
                cc=cc_clean or None,
                attachments=attachments if attachments else None,
            )
        except Exception as e:
            _log.exception(f'Failed to send draft {draft.id}')
            return Response(
                {'error': f'Failed to send: {str(e)}', 'detail': type(e).__name__},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        # Update draft
        from django.utils import timezone
        draft.status = 'sent'
        draft.sent_at = timezone.now()
        draft.save(update_fields=['status', 'sent_at'])

        # Mark the linked QuoteRequest + every Quotation that was actually
        # attached to this draft as sent. We can't rely on QuoteRequest's
        # linked_quotation alone because revisions (V2/V3/...) keep V1 as the
        # link target — so a freshly-revised V2 attached to the draft would
        # never flip. Instead, parse the draft's attachment filenames
        # (Quotation_<number>.pdf) and flip exactly the versions that went out.
        try:
            from quotations.models import Quotation
            import re as _re

            attached_qnums = set()
            for att in draft.attachments.all():
                m = _re.match(r'Quotation_(.+)\.pdf$', att.filename or '', _re.IGNORECASE)
                if m:
                    # Filenames use "-" instead of "/" for filesystem safety —
                    # convert back to the canonical quote number format.
                    attached_qnums.add(m.group(1).replace('-', '/'))

            if attached_qnums:
                from quotations.models import generate_quotation_number
                for q in Quotation.objects.filter(
                    quotation_number__in=attached_qnums,
                    is_deleted=False,
                ).exclude(status='sent'):
                    # Assign a permanent sequential number at send-time so
                    # the sequence only advances for actually-sent quotes.
                    old_number = q.quotation_number
                    q.quotation_number = generate_quotation_number()
                    q.status = 'sent'
                    q.sent_at = timezone.now()
                    q.sent_via = 'email'
                    q.save(update_fields=['quotation_number', 'status', 'sent_at', 'sent_via'])
                    # Update the attachment filename to match the new number
                    # so future sends / filename-parsing still works.
                    new_fname = f'Quotation_{q.quotation_number.replace("/", "-")}.pdf'
                    old_fname = f'Quotation_{old_number.replace("/", "-")}.pdf'
                    draft.attachments.filter(filename=old_fname).update(filename=new_fname)
                    attached_qnums.discard(old_number)
                    attached_qnums.add(q.quotation_number)

            qr = QuoteRequest.objects.filter(
                source_communication=draft.communication,
                is_deleted=False,
            ).select_related('linked_quotation').first()
            if qr:
                # Backwards-compat: if there were no parseable attachments
                # (e.g. older drafts) still flip the original linked V1.
                if not attached_qnums and qr.linked_quotation and qr.linked_quotation.status != 'sent':
                    from quotations.models import generate_quotation_number
                    qr.linked_quotation.quotation_number = generate_quotation_number()
                    qr.linked_quotation.status = 'sent'
                    qr.linked_quotation.sent_at = timezone.now()
                    qr.linked_quotation.sent_via = 'email'
                    qr.linked_quotation.save(update_fields=['quotation_number', 'status', 'sent_at', 'sent_via'])
                if qr.status != 'converted':
                    qr.status = 'converted'
                    qr.save(update_fields=['status'])
        except Exception as e:
            _log.warning(f'Could not update QuoteRequest status for sent draft {draft.id}: {e}')

        # Mark exactly the PI version(s) attached to this draft as sent.
        # We parse PI_<number>.pdf attachment filenames the same way we do
        # for quotations, so revising V1 → V2 and sending V2 only flips V2
        # (not V1, which would already be sent, and not V3 if the user later
        # revised but hasn't attached/sent it).
        try:
            from finance.models import ProformaInvoice
            import re as _re

            attached_pinums = set()
            for att in draft.attachments.all():
                m = _re.match(r'PI_(.+)\.pdf$', att.filename or '', _re.IGNORECASE)
                if m:
                    attached_pinums.add(m.group(1).replace('-', '/'))

            if attached_pinums:
                from finance.models import generate_pi_number
                for p in ProformaInvoice.objects.filter(
                    invoice_number__in=attached_pinums,
                    is_deleted=False,
                ).exclude(status='sent'):
                    old_number = p.invoice_number
                    p.invoice_number = generate_pi_number()
                    p.status = 'sent'
                    p.save(update_fields=['invoice_number', 'status'])
                    # Update attachment filename to match
                    new_fname = f'PI_{p.invoice_number.replace("/", "-")}.pdf'
                    old_fname = f'PI_{old_number.replace("/", "-")}.pdf'
                    draft.attachments.filter(filename=old_fname).update(filename=new_fname)
                    attached_pinums.discard(old_number)
                    attached_pinums.add(p.invoice_number)
            else:
                # Backwards-compat: legacy drafts without parseable filenames
                from finance.models import generate_pi_number
                for p in ProformaInvoice.objects.filter(
                    source_communication=draft.communication,
                    is_deleted=False,
                    status='draft',
                ):
                    p.invoice_number = generate_pi_number()
                    p.status = 'sent'
                    p.save(update_fields=['invoice_number', 'status'])
        except Exception as e:
            _log.warning(f'Could not update PI status for sent draft {draft.id}: {e}')

        # Stamp the reply timestamp on any linked Sample requests so the
        # Samples workflow stepper can advance from "Mail Received" to
        # "Reply Mail". The actual physical-sample status (prepared/dispatched/
        # delivered) is still managed by the executive on the Sample detail page.
        # We also schedule a one-shot follow-up reminder so the executive gets
        # notified if they don't progress the workflow within the threshold.
        try:
            from samples.models import Sample
            from samples.tasks import schedule_sample_reply_reminder
            from django.utils import timezone as _tz
            samples_to_remind = list(Sample.objects.filter(
                source_communication=draft.communication,
                is_deleted=False,
                replied_at__isnull=True,
            ).values_list('id', flat=True))
            if samples_to_remind:
                Sample.objects.filter(id__in=samples_to_remind).update(
                    replied_at=_tz.now(),
                    reminder_sent_at=None,  # re-arm in case it was set previously
                )
                for sid in samples_to_remind:
                    schedule_sample_reply_reminder(sid)
        except Exception as e:
            _log.warning(f'Could not stamp Sample replied_at for sent draft {draft.id}: {e}')

        # Stamp dispatch_notified_at on any dispatched samples linked to this
        # email that haven't been notified yet — covers the case where the
        # executive clicked "Confirm Dispatch" without "Notify Client" and
        # later sent the email manually.
        try:
            from samples.models import Sample
            from django.utils import timezone as _tz
            Sample.objects.filter(
                source_communication=draft.communication,
                is_deleted=False,
                status='dispatched',
                dispatch_notified_at__isnull=True,
            ).update(dispatch_notified_at=_tz.now())
        except Exception as e:
            _log.warning(f'Could not stamp Sample dispatch_notified_at: {e}')

        # Create outgoing Communication record — store the body that was
        # actually sent (with the signature appended) so the thread view
        # matches what the recipient received.
        Communication.objects.create(
            client=draft.client,
            user=request.user,
            comm_type='email',
            direction='outbound',
            subject=draft.subject,
            body=outgoing_html,
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

    @action(detail=True, methods=['post'], url_path='save-draft')
    def save_draft(self, request, pk=None):
        """Save current draft state (subject, body, cc, attachments)."""
        from django.utils import timezone
        from .models import DraftAttachment

        draft = self.get_object()
        if draft.status != 'draft':
            return Response({'error': 'Can only save active drafts'}, status=status.HTTP_400_BAD_REQUEST)

        # Update text fields
        if 'subject' in request.data:
            draft.subject = request.data['subject']
        if 'body' in request.data:
            draft.body = request.data['body']
        if 'cc' in request.data:
            draft.cc = request.data['cc']

        draft.edited_by = request.user
        draft.last_saved_at = timezone.now()
        draft.draft_version += 1
        draft.save()

        # Handle file attachments
        for f in request.FILES.getlist('attachments'):
            DraftAttachment.objects.create(
                draft=draft, file=f, filename=f.name, file_size=f.size,
            )

        return Response(EmailDraftSerializer(draft).data)

    @action(detail=True, methods=['post'], url_path='remove-attachment')
    def remove_attachment(self, request, pk=None):
        """Remove an attachment from a draft."""
        from .models import DraftAttachment
        att_id = request.data.get('attachment_id')
        if not att_id:
            return Response({'error': 'attachment_id required'}, status=status.HTTP_400_BAD_REQUEST)
        DraftAttachment.objects.filter(id=att_id, draft_id=pk).delete()
        return Response({'status': 'removed'})

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

    @action(detail=False, methods=['post'], url_path='backfill-quotes')
    def backfill_quotes(self, request):
        """Run the auto-quote pipeline on existing inbound emails.

        For every eligible inbound email this:
          1) detects quote intent + AI-extracts product/quantity,
          2) auto-creates the Product if it isn't in the master list yet,
          3) creates the QuoteRequest + linked Quotation,
          4) attaches the Quotation PDF to the existing AI draft.

        Body params (all optional):
          - client_id: restrict to one client
          - limit: cap how many to process (default 200)
          - reattach: bool — re-attach PDF even if a quote attachment already exists
        """
        from django.core.files.base import ContentFile
        from django.db import transaction
        from .auto_quote_service import process_communication_for_quote
        from .tasks import _auto_create_sample_request
        from quotations.quotation_service import generate_quotation_pdf

        client_id = request.data.get('client_id')
        limit = int(request.data.get('limit') or 200)
        reattach = bool(request.data.get('reattach'))

        qs = Communication.objects.filter(
            comm_type='email', direction='inbound', is_deleted=False
        ).order_by('-created_at')
        if client_id:
            qs = qs.filter(client_id=client_id)

        # Skip those already linked to a quotation
        already = set(
            QuoteRequest.objects.filter(
                source_communication__in=qs, linked_quotation__isnull=False,
            ).values_list('source_communication_id', flat=True)
        )
        targets = [c for c in qs if c.id not in already][:limit]

        processed = attached = skipped = errors = 0
        for comm in targets:
            try:
                with transaction.atomic():
                    # Sample auto-create — independent of quote detection
                    try:
                        _auto_create_sample_request(comm)
                    except Exception:
                        pass
                    qr = process_communication_for_quote(comm)
                    if not qr:
                        skipped += 1
                        continue
                    processed += 1
                    if not qr.linked_quotation:
                        continue

                    draft = EmailDraft.objects.filter(communication=comm).first()
                    if not draft:
                        continue
                    has_attachment = draft.attachments.filter(
                        filename__icontains='Quotation_'
                    ).exists()
                    if has_attachment and not reattach:
                        continue

                    pdf_buffer = generate_quotation_pdf(qr.linked_quotation)
                    pdf_bytes = pdf_buffer.read()
                    fname = f'Quotation_{qr.linked_quotation.quotation_number.replace("/", "-")}.pdf'
                    att = DraftAttachment(draft=draft, filename=fname, file_size=len(pdf_bytes))
                    att.file.save(fname, ContentFile(pdf_bytes), save=True)
                    attached += 1
            except Exception as e:
                errors += 1
                import logging
                logging.getLogger(__name__).warning(f'Backfill failed on comm {comm.id}: {e}')

        return Response({
            'targets': len(targets),
            'already_linked': len(already),
            'processed': processed,
            'attached': attached,
            'skipped_no_intent': skipped,
            'errors': errors,
        })


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

    @action(detail=False, methods=['get'], url_path='count')
    def count_for_user(self, request):
        """Count of NEW inquiries the current user can see (role-filtered).

        Used by the header badge — same role filtering as the list endpoint
        so executives only see counts for their own assigned/visible inquiries.
        """
        count = self.get_queryset().filter(status='new').count()
        return Response({'count': count})

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


@api_view(['GET'])
@permission_classes([AllowAny])
def signature_logo_view(request):
    """Serve the Kriya logo as a public PNG (no auth required).

    This endpoint is referenced from outgoing email signatures so Gmail's
    image proxy can fetch it. In production, point SIGNATURE_LOGO_URL at the
    public URL of this endpoint (or any CDN-hosted copy of the same image).
    """
    import os
    from django.conf import settings
    from django.http import FileResponse, HttpResponseNotFound
    path = os.path.join(settings.BASE_DIR, 'static', 'images', 'logo.png')
    if not os.path.exists(path):
        return HttpResponseNotFound('logo not found')
    response = FileResponse(open(path, 'rb'), content_type='image/png')
    response['Cache-Control'] = 'public, max-age=86400'
    return response


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

    # Append the executive's per-user signature block to the outgoing body
    from .signature import append_signature
    outgoing_body = append_signature(data['body'], request.user)

    # Send the email
    try:
        message_id = EmailService.send_email(
            email_account=account,
            to=data['to'],
            subject=data['subject'],
            body_html=outgoing_body,
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

    # Create Communication record (store the signed body so the thread view
    # matches what the recipient actually received)
    comm = Communication.objects.create(
        client=client,
        contact=contact,
        user=request.user,
        comm_type='email',
        direction='outbound',
        subject=data['subject'],
        body=outgoing_body,
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
def generate_coa_pdf_view(request):
    """Generate a Certificate of Analysis PDF from form data and attach it
    to the specified email draft."""
    from io import BytesIO
    from django.core.files.base import ContentFile
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    data = request.data
    draft_id = data.get('draft_id')

    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=25*mm, rightMargin=25*mm, topMargin=20*mm, bottomMargin=20*mm)
    styles = getSampleStyleSheet()
    el = []

    # Logo
    import os
    from django.conf import settings
    logo_path = os.path.join(settings.BASE_DIR, '..', 'frontend', 'public', 'logo.png')
    if os.path.exists(logo_path):
        try:
            el.append(Image(logo_path, width=100, height=45))
        except Exception:
            pass
    el.append(Spacer(1, 5*mm))

    # Title
    title_style = ParagraphStyle('coa_title', fontSize=14, fontName='Helvetica-Bold', alignment=1, spaceAfter=10)
    el.append(Paragraph('<u>CERTIFICATE OF ANALYSIS</u>', title_style))
    el.append(Spacer(1, 5*mm))

    # Helper styles
    lb = ParagraphStyle('lb', fontSize=10, fontName='Helvetica-Bold', leading=13)
    lv = ParagraphStyle('lv', fontSize=10, fontName='Helvetica', leading=13)

    # Report No + Date
    report_table = Table([
        [Paragraph('<b>REPORT NO:</b>', lb), Paragraph(data.get('report_no', ''), lv),
         Paragraph('<b>DATE:</b>', lb), Paragraph(data.get('date', ''), lv)],
    ], colWidths=[80, 140, 50, 100])
    report_table.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.5, colors.grey),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    el.append(report_table)
    el.append(Spacer(1, 3*mm))

    # Product details
    detail_rows = [
        ('Product Name', data.get('product_name', '')),
        ('Sample Description', data.get('sample_description', '')),
        ('Manufacturing Date', data.get('manufacturing_date', '')),
        ('Expiration Date', data.get('expiration_date', '')),
        ('Date of Receipt of Sample', data.get('receipt_date', '')),
        ('Date of Start of Analysis', data.get('start_date', '')),
        ('Date of Completion of Analysis', data.get('completion_date', '')),
    ]
    detail_table = Table(
        [[Paragraph(f'<b>{label}</b>', lb), Paragraph(val, lv)] for label, val in detail_rows],
        colWidths=[200, 270],
    )
    detail_table.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.5, colors.grey),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND', (0,0), (0,-1), colors.Color(0.96, 0.96, 0.96)),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    el.append(detail_table)
    el.append(Spacer(1, 4*mm))

    # Test results
    test_rows = [
        ('Appearance', data.get('appearance', '')),
        ('Odour', data.get('odour', '')),
        ('pH', data.get('ph', '')),
        ('Specific Gravity', data.get('specific_gravity', '')),
        ('Solubility', data.get('solubility', '')),
        (data.get('active_label', 'Active Content'), data.get('active_content', '')),
    ]
    th = ParagraphStyle('th', fontSize=10, fontName='Helvetica-Bold', alignment=1, leading=13)
    test_table_data = [
        [Paragraph('<b>TEST RESULT</b>', ParagraphStyle('tr_h', fontSize=11, fontName='Helvetica-Bold', alignment=1))],
    ]
    # Merge first row across 2 cols handled via spanning
    test_data = [
        [Paragraph('<b>TESTING PARAMETERS</b>', th), Paragraph('<b>RESULTS</b>', th)],
    ] + [[Paragraph(f'<b>{label}</b>', lb), Paragraph(val, lv)] for label, val in test_rows]

    # Header row
    header_row = Table([[Paragraph('<b>TEST RESULT</b>', th)]], colWidths=[470])
    header_row.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND', (0,0), (-1,-1), colors.Color(0.96, 0.96, 0.96)),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    el.append(header_row)

    test_table = Table(test_data, colWidths=[235, 235])
    test_table.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), 0.5, colors.grey),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.grey),
        ('BACKGROUND', (0,0), (0,0), colors.Color(0.93, 0.93, 0.93)),
        ('BACKGROUND', (1,0), (1,0), colors.Color(0.93, 0.93, 0.93)),
        ('BACKGROUND', (0,1), (0,-1), colors.Color(0.96, 0.96, 0.96)),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    el.append(test_table)
    el.append(Spacer(1, 10*mm))

    # Signature
    el.append(Paragraph('Checked by', ParagraphStyle('sig_label', fontSize=10, fontName='Helvetica', leading=13)))
    el.append(Spacer(1, 15*mm))

    # Signature + seal
    sign_path = os.path.join(settings.BASE_DIR, '..', 'frontend', 'public', 'sign.png')
    seal_path = os.path.join(settings.BASE_DIR, '..', 'frontend', 'public', 'seal.png')
    sig_elements = []
    if os.path.exists(sign_path):
        try:
            sig_elements.append(Image(sign_path, width=60, height=30))
        except Exception:
            pass
    sig_elements.append(Paragraph(f'<b>{data.get("checked_by", "Technical Manager")}</b>', lb))

    seal_elements = []
    if os.path.exists(seal_path):
        try:
            seal_elements.append(Image(seal_path, width=50, height=50))
        except Exception:
            pass

    if sig_elements or seal_elements:
        sig_table = Table([[sig_elements, seal_elements]], colWidths=[300, 170])
        sig_table.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'BOTTOM')]))
        el.append(sig_table)

    doc.build(el)
    pdf_bytes = buf.getvalue()

    # Attach to draft if draft_id provided
    if draft_id:
        try:
            from .models import EmailDraft, DraftAttachment
            draft = EmailDraft.objects.get(id=draft_id)
            product_name = (data.get('product_name', 'Product') or 'Product').replace(' ', '_')
            filename = f'COA_{product_name}.pdf'
            # Remove existing COA attachment
            DraftAttachment.objects.filter(draft=draft, filename__startswith='COA_').delete()
            att = DraftAttachment(draft=draft, filename=filename, file_size=len(pdf_bytes))
            att.file.save(filename, ContentFile(pdf_bytes), save=True)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f'COA attach failed: {e}')

    from django.http import HttpResponse
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="COA_{data.get("product_name", "Product")}.pdf"'
    return response


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


@api_view(['POST'])
def grammar_check_view(request):
    """AI-powered grammar and spelling check.

    Accepts { text: "..." } and returns a list of corrections:
    [{ original: "teh", corrected: "the", reason: "Spelling" }, ...]

    Uses the same Groq/Gemini AI backend as the email reply generator.
    """
    text = request.data.get('text', '').strip()
    if not text or len(text) < 5:
        return Response({'corrections': []})

    import json
    import logging
    _log = logging.getLogger(__name__)

    prompt = f"""You are an extremely strict English proofreader and spelling checker. Your job is to find EVERY single error in the text below. Be very thorough — do NOT skip any mistake.

Check for ALL of these:
1. SPELLING ERRORS — every misspelled word (e.g. "mesage" should be "message", "helth" should be "health", "infrom" should be "inform", "recieved" should be "received", "priceing" should be "pricing", "prodcut" should be "product", "amout" should be "amount", "guarentee" should be "guarantee", "quailty" should be "quality", "confrim" should be "confirm", "procede" should be "proceed", "quotaion" should be "quotation", "refrence" should be "reference", "quaries" should be "queries", "furthur" should be "further", "discus" should be "discuss", "detials" should be "details", "definately" should be "definitely", "servce" should be "service", "valueable" should be "valuable", "concentraton" should be "concentration", "timly" should be "timely", "hesitate" check carefully)
2. GRAMMAR ERRORS — subject-verb agreement (e.g. "we has" should be "we have", "We is" should be "We are", "team is available" should be "team are available"), pronoun errors (e.g. "me and my team" should be "my team and I")
3. WORD CHOICE — (e.g. "Looking forward for" should be "Looking forward to")
4. PUNCTUATION — missing commas, periods, etc.

You MUST catch every misspelled word. Compare each word against a dictionary. If a word is not a real English word, it is misspelled.

Return a JSON array of objects. Each object must have:
- "original": the EXACT wrong word/phrase as it appears in the text
- "corrected": the fixed version
- "reason": one of "Spelling", "Grammar", "Punctuation", "Word choice"

Return ONLY the JSON array. No markdown fences, no explanation, no other text.
If there are truly zero errors, return: []

TEXT TO CHECK:
{text[:3000]}"""

    try:
        from agents.models import AIConfig
        from common.encryption import decrypt_value

        config = AIConfig.objects.filter(is_active=True).first()
        if not config:
            return Response({'corrections': []})

        api_key = decrypt_value(config.api_key)
        result_text = ''

        if config.provider == 'groq':
            from groq import Groq
            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model=config.model_name or 'llama-3.3-70b-versatile',
                messages=[
                    {'role': 'system', 'content': 'You are a strict English proofreader. Find EVERY spelling and grammar error. Return ONLY a JSON array. Never return an empty array if there are misspelled words.'},
                    {'role': 'user', 'content': prompt},
                ],
                temperature=0,
                max_tokens=3000,
            )
            result_text = response.choices[0].message.content.strip()
        elif config.provider == 'gemini':
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=config.model_name or 'gemini-2.0-flash',
                contents=prompt,
            )
            result_text = response.text.strip()
        else:
            return Response({'corrections': []})

        # Parse JSON from the AI response (strip markdown fences if present)
        if result_text.startswith('```'):
            result_text = result_text.split('\n', 1)[-1].rsplit('```', 1)[0].strip()
        corrections = json.loads(result_text)
        if not isinstance(corrections, list):
            corrections = []
        # Validate each correction has required fields
        valid = []
        for c in corrections:
            if isinstance(c, dict) and c.get('original') and c.get('corrected'):
                valid.append({
                    'original': c['original'],
                    'corrected': c['corrected'],
                    'reason': c.get('reason', ''),
                    'index': len(valid),
                })
        return Response({'corrections': valid})

    except Exception as e:
        _log.warning(f'Grammar check failed: {e}')
        return Response({'corrections': []})


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
