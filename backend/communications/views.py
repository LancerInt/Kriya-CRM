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

            # Thread ONLY by email message-id / in-reply-to chain.
            # No subject matching — different emails with the same subject
            # are separate threads unless they have reply headers linking them.
            related = Communication.objects.filter(
                is_deleted=False,
                comm_type='email',
            ).filter(
                Q(email_message_id__in=message_ids) |
                Q(email_in_reply_to__in=message_ids) |
                Q(email_in_reply_to=comm.email_message_id)
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

        # Resolve threading headers from the source communication so the
        # outbound mail stays in the same thread as the original inquiry.
        from .services import get_thread_headers, normalize_reply_subject
        in_reply_to, references, reply_subject = get_thread_headers(
            draft.client, source_communication=draft.communication,
        )
        # When we have a thread, force the email's subject to the thread's
        # canonical "Re: <original>" so Gmail/Outlook visually group it with
        # the source conversation. Headers alone aren't enough — most mail
        # clients also collapse on subject.
        # If the source thread had no usable subject (rare), fall back to
        # normalizing whatever the user composed.
        if in_reply_to:
            usable = (reply_subject or '').strip()
            if usable and usable.lower() not in ('re:', 're :'):
                draft.subject = usable
            else:
                normalized = normalize_reply_subject(draft.subject)
                if normalized and normalized != draft.subject:
                    draft.subject = normalized

        # Send email with CC and attachments + threading headers
        try:
            sent_message_id = EmailService.send_email(
                email_account=email_account,
                to=draft.to_email.strip(),
                subject=draft.subject,
                body_html=outgoing_html,
                cc=cc_clean or None,
                attachments=attachments if attachments else None,
                in_reply_to=in_reply_to,
                references=references,
            ) or ''
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

        # Auto-transition orders whose dispatch / transit emails just went
        # out. Priority: explicit `editor_data.auto_actions` set by the
        # dispatch-mail-draft / transit-mail-draft endpoints (cleanest +
        # works even if attachments were edited or none were attached).
        # Fallback: scan attachment filenames for legacy drafts without
        # the auto_actions metadata.
        try:
            import re as _re
            import logging
            from orders.models import Order
            from orders.workflow_service import transition_order
            log = logging.getLogger(__name__)

            handled_order_ids = set()

            # 1. Honour explicit auto_actions stamped on the draft
            actions = (draft.editor_data or {}).get('auto_actions') or []
            for act in actions:
                if act.get('type') != 'order_transition':
                    continue
                oid = act.get('order_id')
                target = act.get('to_status')
                expected_from = act.get('from_status')
                if not (oid and target):
                    continue
                order = Order.objects.filter(id=oid, is_deleted=False).first()
                if not order:
                    continue
                if expected_from and order.status != expected_from:
                    log.info(f'Skip auto-transition for {order.order_number}: status {order.status} != {expected_from}')
                    continue
                try:
                    transition_order(order, target, request.user, remarks=f'Auto-transition on email send ({target})')
                    handled_order_ids.add(str(order.id))
                except Exception as _e:
                    log.warning(f'Auto-transition for {oid} -> {target} failed: {_e}')

            # 2. Filename-based fallback for legacy drafts
            dispatch_orders = set()
            transit_orders = set()
            for att in draft.attachments.all():
                fn = att.filename or ''
                m = _re.match(r'(?:Client_Invoice|Client_Packing_List|COA|MSDS|Insurance|Factory_Stuffing)_(ORD-[A-Za-z0-9-]+)', fn)
                if m:
                    dispatch_orders.add(m.group(1))
                m2 = _re.match(r'BL_(ORD-[A-Za-z0-9-]+)', fn)
                if m2:
                    transit_orders.add(m2.group(1))

            for ono in dispatch_orders:
                order = Order.objects.filter(order_number=ono, status='docs_approved', is_deleted=False).first()
                if order and str(order.id) not in handled_order_ids:
                    try:
                        transition_order(order, 'dispatched', request.user, remarks='Dispatch email sent')
                        handled_order_ids.add(str(order.id))
                    except Exception as _e:
                        log.warning(f'Auto-dispatch transition failed for {ono}: {_e}')

            for ono in transit_orders:
                order = Order.objects.filter(order_number=ono, status='dispatched', is_deleted=False).first()
                if order and str(order.id) not in handled_order_ids:
                    try:
                        transition_order(order, 'in_transit', request.user, remarks='In-transit email sent')
                        handled_order_ids.add(str(order.id))
                    except Exception as _e:
                        log.warning(f'Auto-in-transit transition failed for {ono}: {_e}')
        except Exception:
            import logging
            logging.getLogger(__name__).exception('Failed during dispatch/transit post-send hook')

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

            # Find QuoteRequest by source_communication OR by linked quotation
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
            # Also mark any QuoteRequest whose linked quotation was just sent
            # (handles case where QR source_communication differs from draft.communication)
            if attached_qnums:
                sent_q_ids = list(Quotation.objects.filter(
                    quotation_number__in=attached_qnums, is_deleted=False,
                ).values_list('id', flat=True))
                if sent_q_ids:
                    for other_qr in QuoteRequest.objects.filter(
                        linked_quotation_id__in=sent_q_ids, is_deleted=False,
                    ).exclude(status='converted'):
                        other_qr.status = 'converted'
                        other_qr.save(update_fields=['status'])
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

        # Sample-related side-effects of a draft send.
        #
        # IMPORTANT: do NOT advance Sample.status from this hook. Sample
        # progression (Reply Mail → Prepared → [Payment Received] →
        # Dispatched → Delivered → Feedback) is enforced step-by-step by
        # samples/serializers.py and the /samples/{id}/advance/ endpoint.
        # Auto-flipping status here was bypassing that gate and causing the
        # "Reply Mail → Dispatched" jump.
        #
        # We do two things only:
        #   1. Stamp ``replied_at`` on samples linked to this email so the
        #      Reply Mail step in the timeline shows ✓.
        #   2. If the sample is already in ``dispatched`` (set explicitly by
        #      the user via the stepper) and ``dispatch_notified_at`` is
        #      empty, stamp the notification timestamp. No status change.
        try:
            from samples.models import Sample
            from django.utils import timezone as _tz

            Sample.objects.filter(
                source_communication=draft.communication,
                is_deleted=False,
                replied_at__isnull=True,
            ).update(replied_at=_tz.now())

            # For paid samples that are still at "requested", advance to
            # "replied" — but ONLY one step, never further. Free samples have
            # no "replied" status; their replied_at flag is enough.
            paid_to_replied = Sample.objects.filter(
                source_communication=draft.communication,
                is_deleted=False,
                sample_type='paid',
                status='requested',
            )
            for s in paid_to_replied:
                s.status = 'replied'
                s.save(update_fields=['status'])

            # Notification timestamp on already-dispatched samples.
            Sample.objects.filter(
                source_communication=draft.communication,
                is_deleted=False,
                status='dispatched',
                dispatch_notified_at__isnull=True,
            ).update(dispatch_notified_at=_tz.now())
        except Exception as e:
            _log.warning(f'Could not stamp Sample reply/dispatch metadata: {e}')

        # Create outgoing Communication record — store the body that was
        # actually sent (with the signature appended) so the thread view
        # matches what the recipient received. Stamp the threading metadata
        # so any further reply we send (PI, dispatch, transit, etc.) keeps
        # the same References chain.
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
            email_message_id=sent_message_id,
            email_in_reply_to=in_reply_to or (draft.communication.email_message_id or ''),
            email_references=references or '',
            email_cc=cc_clean,
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
        if 'editor_data' in request.data:
            import json
            ed = request.data['editor_data']
            draft.editor_data = json.loads(ed) if isinstance(ed, str) else ed

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

    # Resolve the recipient's client first so we can thread on top of any
    # existing conversation with them.
    client = None
    contact = None
    if data.get('client'):
        from clients.models import Client
        client = Client.objects.filter(id=data['client']).first()
    else:
        client, contact = ContactMatcher.match_by_email(data['to'])

    # Pull thread headers — replies into an existing client conversation use
    # the same In-Reply-To / References chain. New conversations get fresh
    # headers.
    from .services import get_thread_headers, normalize_reply_subject
    in_reply_to, references, _reply_subject = get_thread_headers(client)
    subject_to_send = data['subject']
    if in_reply_to:
        subject_to_send = normalize_reply_subject(subject_to_send)

    # Send the email
    try:
        message_id = EmailService.send_email(
            email_account=account,
            to=data['to'],
            subject=subject_to_send,
            body_html=outgoing_body,
            cc=data.get('cc') or None,
            bcc=data.get('bcc') or None,
            attachments=attachments or None,
            in_reply_to=in_reply_to,
            references=references,
        )
    except Exception as e:
        return Response(
            {'error': f'Failed to send email: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

    # Create Communication record (store the signed body so the thread view
    # matches what the recipient actually received), stamped with full
    # threading metadata.
    comm = Communication.objects.create(
        client=client,
        contact=contact,
        user=request.user,
        comm_type='email',
        direction='outbound',
        subject=subject_to_send,
        body=outgoing_body,
        status='sent',
        email_message_id=message_id,
        email_in_reply_to=in_reply_to or '',
        email_references=references or '',
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

    import os, json
    from django.conf import settings as _s

    # Handle both JSON body and multipart/form-data (when custom logo is uploaded)
    if request.content_type and 'multipart' in request.content_type:
        data = json.loads(request.data.get('payload', '{}'))
        logo_file = request.FILES.get('logo_file', None)
    else:
        data = request.data
        logo_file = None

    draft_id = data.get('draft_id')
    hide_logo = data.get('hide_logo', False)

    buf = BytesIO()
    # Use the full available width (A4 = 210mm, margins 20mm each = 170mm usable)
    TW = 160 * mm  # total table width
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=25*mm, rightMargin=25*mm, topMargin=15*mm, bottomMargin=15*mm)
    el = []

    # ═══ LOGO (top-left, bigger — matching original COA) ═══
    if not hide_logo:
        if logo_file:
            # Custom uploaded logo
            try:
                logo_bytes = BytesIO(logo_file.read())
                img = Image(logo_bytes, width=160, height=80)
                img.hAlign = 'LEFT'
                el.append(img)
            except Exception:
                pass
        else:
            # Default logo from filesystem
            logo_path = os.path.join(_s.BASE_DIR, '..', 'frontend', 'public', 'logo.png')
            if os.path.exists(logo_path):
                try:
                    img = Image(logo_path, width=160, height=80)
                    img.hAlign = 'LEFT'
                    el.append(img)
                except Exception:
                    pass
    el.append(Spacer(1, 10*mm))

    # ═══ TITLE — Times New Roman 12pt, centered, bold, underlined ═══
    title_s = ParagraphStyle('coa_title', fontSize=12, fontName='Times-Bold', alignment=1, spaceAfter=8*mm)
    el.append(Paragraph('<u>CERTIFICATE OF ANALYSIS</u>', title_s))

    # ═══ HELPER STYLES — Times New Roman 11pt for all fields ═══
    lb = ParagraphStyle('lb', fontSize=11, fontName='Times-Bold', leading=14)
    lv = ParagraphStyle('lv', fontSize=11, fontName='Times-Roman', leading=14)
    th_c = ParagraphStyle('th_c', fontSize=11, fontName='Times-Bold', alignment=1, leading=14)
    BORDER = 0.5
    BC = colors.Color(0.3, 0.3, 0.3)  # dark gray border
    # Label column and value column widths (matching original proportions ~40/60)
    LW = TW * 0.42
    VW = TW * 0.58

    # ═══ UNIFIED TABLE: Report No/Date + Product Details — all same width ═══
    report_no = data.get('report_no', '')
    date_val = data.get('date', '')
    # First row: REPORT NO on left, DATE on right — inside the same 2 columns
    all_rows = [
        [Paragraph(f'<b>REPORT NO:</b> {report_no}', lb),
         Paragraph(f'<b>DATE:</b> {date_val}', ParagraphStyle('rv', fontSize=11, fontName='Times-Bold', leading=14, alignment=2))],
    ]
    # Product detail rows — accept dynamic array from frontend, fallback to static
    detail_rows_data = data.get('detail_rows', None)
    if detail_rows_data and isinstance(detail_rows_data, list):
        for row in detail_rows_data:
            label = row.get('label', '') if isinstance(row, dict) else ''
            val = row.get('value', '') if isinstance(row, dict) else ''
            if label or val:
                all_rows.append([Paragraph(f'<b>{label}</b>', lb), Paragraph(val, lv)])
    else:
        for label, val in [
            ('Product Name', data.get('product_name', '')),
            ('Sample Description', data.get('sample_description', '')),
            ('Manufacturing Date', data.get('manufacturing_date', '')),
            ('Expiration Date', data.get('expiration_date', '')),
            ('Date of Receipt of Sample', data.get('receipt_date', '')),
            ('Date of Start of Analysis', data.get('start_date', '')),
            ('Date of Completion of Analysis', data.get('completion_date', '')),
        ]:
            all_rows.append([Paragraph(f'<b>{label}</b>', lb), Paragraph(val, lv)])

    dt = Table(all_rows, colWidths=[LW, VW])
    dt.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), BORDER, BC),
        ('INNERGRID', (0,0), (-1,-1), BORDER, BC),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
    ]))
    el.append(dt)

    # ═══ TEST RESULT — dynamic rows from frontend, fallback to static ═══
    test_rows_data = data.get('test_rows', None)
    if test_rows_data and isinstance(test_rows_data, list):
        test_rows = [(r.get('label', ''), r.get('value', '')) for r in test_rows_data if isinstance(r, dict) and (r.get('label') or r.get('value'))]
    else:
        test_rows = [
            ('Appearance', data.get('appearance', '')),
            ('Odour', data.get('odour', '')),
            ('pH', data.get('ph', '')),
            ('Specific Gravity', data.get('specific_gravity', '')),
            ('Solubility', data.get('solubility', '')),
            (data.get('active_label', 'Active Content'), data.get('active_content', '')),
        ]
    test_data = [
        [Paragraph('<b>TEST RESULT</b>', th_c), ''],
        [Paragraph('<b>TESTING PARAMETERS</b>', th_c), Paragraph('<b>RESULTS</b>', th_c)],
    ] + [[Paragraph(f'<b>{label}</b>', lb), Paragraph(val, lv)] for label, val in test_rows]

    tt = Table(test_data, colWidths=[LW, VW])
    tt.setStyle(TableStyle([
        ('BOX', (0,0), (-1,-1), BORDER, BC),
        ('INNERGRID', (0,0), (-1,-1), BORDER, BC),
        ('SPAN', (0,0), (1,0)),  # "TEST RESULT" spans both columns
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
    ]))
    el.append(tt)
    el.append(Spacer(1, 12*mm))

    # ═══ SIGNATURE SECTION ═══
    hide_sign = data.get('hide_sign', False)
    hide_seal = data.get('hide_seal', False)
    sign_file = request.FILES.get('sign_file', None) if request.content_type and 'multipart' in request.content_type else None
    seal_file = request.FILES.get('seal_file', None) if request.content_type and 'multipart' in request.content_type else None

    sig_s = ParagraphStyle('sig', fontSize=11, fontName='Times-Roman', leading=14)
    el.append(Paragraph('Checked by', sig_s))
    el.append(Spacer(1, 12*mm))

    sign_path = os.path.join(_s.BASE_DIR, '..', 'frontend', 'public', 'sign.png')
    seal_path = os.path.join(_s.BASE_DIR, '..', 'frontend', 'public', 'seal.png')

    sig_col = []
    if not hide_sign:
        if sign_file:
            try:
                sign_bytes = BytesIO(sign_file.read())
                sign_img = Image(sign_bytes, width=70, height=35)
                sign_img.hAlign = 'LEFT'
                sig_col.append(sign_img)
            except Exception:
                pass
        elif os.path.exists(sign_path):
            try:
                sign_img = Image(sign_path, width=70, height=35)
                sign_img.hAlign = 'LEFT'
                sig_col.append(sign_img)
            except Exception:
                pass
    sig_col.append(Paragraph(f'<b>{data.get("checked_by", "Technical Manager")}</b>', lb))

    seal_col = []
    if not hide_seal:
        if seal_file:
            try:
                seal_bytes = BytesIO(seal_file.read())
                seal_img = Image(seal_bytes, width=55, height=55)
                seal_img.hAlign = 'LEFT'
                seal_col.append(seal_img)
            except Exception:
                pass
        elif os.path.exists(seal_path):
            try:
                seal_img = Image(seal_path, width=55, height=55)
                seal_img.hAlign = 'LEFT'
                seal_col.append(seal_img)
            except Exception:
                pass

    if sig_col or seal_col:
        sig_table = Table([[sig_col, seal_col]], colWidths=[TW * 0.5, TW * 0.5])
        sig_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
        ]))
        sig_table.hAlign = 'LEFT'
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

    # Save to the order's Documents tab if order_id provided
    order_id = data.get('order_id')
    order_item_id = data.get('order_item_id')
    # Optional audience scope: 'both' (default — covers Client+Logistic),
    # 'client' or 'logistic'. The frontend asks the user before generating.
    scope = (data.get('scope') or 'both').strip().lower()
    if scope not in ('both', 'client', 'logistic'):
        scope = 'both'
    if order_id:
        try:
            from orders.models import Order, OrderDocument, OrderItem
            order = Order.objects.get(id=order_id)
            product_name = (data.get('product_name', 'Product') or 'Product').replace(' ', '_')
            scope_suffix = '' if scope == 'both' else f'_{scope.capitalize()}'
            filename = f'COA_{product_name}{scope_suffix}.pdf'
            order_item = None
            if order_item_id:
                try:
                    order_item = OrderItem.objects.get(id=order_item_id, order=order)
                except OrderItem.DoesNotExist:
                    order_item = None
            # Only replace docs of the same scope so a "client" generate
            # doesn't wipe out the existing "logistic" doc (and vice versa).
            scope_filter = filename
            if order_item:
                OrderDocument.objects.filter(order=order, doc_type='coa', order_item=order_item, name=scope_filter, is_deleted=False).delete()
            else:
                OrderDocument.objects.filter(order=order, doc_type='coa', order_item__isnull=True, name=scope_filter, is_deleted=False).delete()
            OrderDocument.objects.create(
                order=order, order_item=order_item, doc_type='coa', name=filename,
                file=ContentFile(pdf_bytes, name=filename), uploaded_by=request.user,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f'COA order-attach failed: {e}')

    from django.http import HttpResponse
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="COA_{data.get("product_name", "Product")}.pdf"'
    return response


@api_view(['POST'])
def generate_msds_pdf_view(request):
    """Generate a Material Safety Data Sheet PDF from form data."""
    from io import BytesIO
    from django.core.files.base import ContentFile
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib import colors
    import os
    from django.conf import settings as _s

    data = request.data
    draft_id = data.get('draft_id')

    buf = BytesIO()
    TW = 160 * mm

    import os
    from django.conf import settings as _s
    from reportlab.lib.pagesizes import A4 as _A4

    # ── Page template: draw logo on EVERY page (top-left) ──
    logo_path = os.path.join(_s.BASE_DIR, '..', 'frontend', 'public', 'logo.png')
    _logo_exists = os.path.exists(logo_path)

    def _msds_header_footer(canvas, doc_obj):
        """Draw the Kriya logo on every page — flush to the left margin.
        Logo sits in the header zone above the 1.5cm content spacing.
        Text content starts 1.5cm below the logo (topMargin=35mm).
        """
        canvas.saveState()
        if _logo_exists:
            try:
                canvas.drawImage(logo_path, 10*mm, _A4[1] - 25*mm, width=130, height=65, preserveAspectRatio=True, mask='auto')
            except Exception:
                pass
        canvas.restoreState()

    # Top margin = logo zone (~25mm) + 1.5cm gap = 40mm on first page.
    # But we want text to start just 1.5cm below the logo, so use 28mm
    # (logo drawn at page_top - 25mm, ~10mm tall visually, then 1.5cm gap).
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=25*mm, rightMargin=25*mm, topMargin=28*mm, bottomMargin=15*mm)
    el = []

    # Italic labels (left column), regular values (right column) — NO borders
    li = ParagraphStyle('msds_li', fontSize=10, fontName='Helvetica-Oblique', leading=13)
    rv = ParagraphStyle('msds_rv', fontSize=10, fontName='Helvetica', leading=13)
    lb = ParagraphStyle('msds_lb', fontSize=10, fontName='Helvetica-Bold', leading=13)
    # Section heading: centered, bold, underlined
    sec_h = ParagraphStyle('msds_sec', fontSize=11, fontName='Helvetica-Bold', alignment=1, leading=14, spaceAfter=3*mm)
    title_s = ParagraphStyle('msds_title', fontSize=13, fontName='Helvetica-Bold', alignment=1, leading=16)
    sub_s = ParagraphStyle('msds_sub', fontSize=12, fontName='Helvetica-Bold', alignment=1, leading=15)
    sm = ParagraphStyle('msds_sm', fontSize=9, fontName='Helvetica', leading=11, textColor=colors.Color(0.3, 0.3, 0.3))
    body_s = ParagraphStyle('msds_body', fontSize=10, fontName='Helvetica', leading=13, alignment=4)  # justified
    disc_s = ParagraphStyle('msds_disc', fontSize=9, fontName='Helvetica', leading=12, alignment=4)
    LW = TW * 0.40
    VW = TW * 0.60

    # Logo is drawn on every page via _msds_header_footer — no inline spacer needed
    el.append(Paragraph('<b>SAFETY DATA SHEET</b>', title_s))
    el.append(Paragraph(f'<b>{data.get("product_name", "")}</b>', sub_s))
    el.append(Spacer(1, 2*mm))

    # Company + Contact — no borders, just text
    addr = Paragraph(
        '<b>M/s. KRIYA BIOSYS (P) LTD,</b><br/>'
        'D.no : 233, Aarthi Nagar,<br/>'
        'Mohan Nagar, Narasothipatti,<br/>'
        'Salem - 636004, Tamilnadu', sm)
    contact = Paragraph(
        'Mail: info@kriya.ltd<br/>'
        'Tel: +91 6385848466',
        ParagraphStyle('contact_r', fontSize=9, fontName='Helvetica', leading=11, alignment=2, textColor=colors.Color(0.3, 0.3, 0.3)))
    addr_t = Table([[addr, contact]], colWidths=[TW * 0.55, TW * 0.45])
    addr_t.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
    el.append(addr_t)
    el.append(Spacer(1, 6*mm))

    # ═══ HELPER: borderless 2-column table (italic label, regular value) ═══
    def borderless_rows(rows):
        t = Table(
            [[Paragraph(f'<i>{label}</i>', li), Paragraph((val or '').replace('\n', '<br/>'), rv)]
             for label, val in rows],
            colWidths=[LW, VW],
        )
        t.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 3),
            ('BOTTOMPADDING', (0,0), (-1,-1), 3),
            ('LEFTPADDING', (0,0), (0,-1), 10),
            ('LEFTPADDING', (1,0), (1,-1), 6),
        ]))
        return t

    def section_heading(num, title):
        el.append(Spacer(1, 4*mm))
        el.append(Paragraph(f'<b>{num}.&nbsp;&nbsp;&nbsp;<u>{title.upper()}</u></b>', sec_h))

    def build_section(num, title, rows_data):
        section_heading(num, title)
        if rows_data == "comp":
            # Underlined column headers + borderless rows
            comp_hdr = Table([
                [Paragraph('<i><u>Chemical Components</u></i>', li),
                 Paragraph('<i><u>Percentage Range</u></i>', li)],
            ], colWidths=[LW, VW])
            comp_hdr.setStyle(TableStyle([
                ('LEFTPADDING', (0,0), (0,-1), 10),
                ('TOPPADDING', (0,0), (-1,-1), 2),
                ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ]))
            el.append(comp_hdr)
            el.append(borderless_rows([
                (data.get('comp_1_name', ''), data.get('comp_1_pct', '')),
                (data.get('comp_2_name', ''), data.get('comp_2_pct', '')),
            ]))
        elif rows_data == "eco":
            el.append(Spacer(1, 2*mm))
            eco_text = (data.get('ecological_info', '') or '').replace('\n', '<br/>')
            p = Paragraph(f'<b>{eco_text}</b>', ParagraphStyle('eco_b', fontSize=10, fontName='Helvetica-Bold', leading=13, leftIndent=10))
            el.append(p)
        elif rows_data == "other":
            el.append(Spacer(1, 2*mm))
            info = data.get('other_info', '') or ''
            disclaimer = data.get('disclaimer', '') or ''
            if info:
                el.append(Paragraph(f'N/A – Not applicable; <i>{info}</i>', ParagraphStyle('oi', fontSize=10, fontName='Helvetica', leading=13, leftIndent=10)))
            if disclaimer:
                el.append(Spacer(1, 3*mm))
                el.append(Paragraph(disclaimer.replace('\n', '<br/>'), disc_s))
        elif rows_data == "hazard":
            # Special: Emergency Overview box + regular rows
            overview = data.get('emergency_overview', '')
            if overview:
                el.append(Spacer(1, 2*mm))
                # Boxed Emergency Overview
                box_title = Paragraph('<b><u>EMERGENCY OVERVIEW</u></b>', ParagraphStyle('eo_t', fontSize=10, fontName='Helvetica-Bold', alignment=1, leading=13))
                box_body = Paragraph(overview.replace('\n', '<br/>'), body_s)
                box = Table([[box_title], [box_body]], colWidths=[TW - 20])
                box.setStyle(TableStyle([
                    ('BOX', (0,0), (-1,-1), 0.5, colors.Color(0.3, 0.3, 0.3)),
                    ('TOPPADDING', (0,0), (-1,-1), 4),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                    ('LEFTPADDING', (0,0), (-1,-1), 8),
                    ('RIGHTPADDING', (0,0), (-1,-1), 8),
                ]))
                el.append(box)
                el.append(Spacer(1, 3*mm))
            # Rest of hazard rows (skip emergency_overview)
            hazard_rows = [
                ("Central Insecticides Board signal word", data.get("signal_word", "")),
                ("Potential Health Effects", data.get("potential_health_effects", "")),
                ("Route(s) Of Entry", data.get("routes_of_entry", "")),
                ("Human Effects And Symptoms Of Overexposure", data.get("human_effects", "")),
                ("Acute Eye Contact", data.get("acute_eye", "")),
                ("Chronic Eye Contact", data.get("chronic_eye", "")),
                ("Acute Skin Contact", data.get("acute_skin", "")),
                ("Chronic Ingestion", data.get("chronic_ingestion", "")),
                ("Medical Conditions Aggravated By Exposure", data.get("medical_conditions", "")),
            ]
            el.append(borderless_rows(hazard_rows))
        elif rows_data == "first_aid":
            # First aid has a preamble paragraph + rows
            preamble = "If poisoning is suspected, immediately contact a physician or the nearest hospital, tell the person contacted the complete product name and the type and amount of exposure. Describe any symptoms and follow the advice given."
            el.append(Spacer(1, 2*mm))
            el.append(Paragraph(preamble, body_s))
            el.append(Spacer(1, 2*mm))
            el.append(borderless_rows([
                ("First Aid For Eyes", data.get("first_aid_eyes", "")),
                ("First Aid For Skin", data.get("first_aid_skin", "")),
                ("First Aid For Inhalation", data.get("first_aid_inhalation", "")),
                ("First Aid For Ingestion", data.get("first_aid_ingestion", "")),
            ]))
        else:
            el.append(borderless_rows(rows_data))

    # All 16 sections — matching the original MSDS format exactly
    sections = [
        ("1", "Product Name", [
            ("Product Name", data.get("product_name", "")),
            ("Common Name", data.get("common_name", "")),
        ]),
        ("2", "Composition / Information of Ingredients", "comp"),
        ("3", "Hazardous Identification", "hazard"),
        ("4", "First Aid Measures", "first_aid"),
        ("5", "Fire Fighting Measures", [
            ("Extinguishing Media", data.get("extinguishing_media", "")),
            ("Unusual Fire & Explosion Hazards", data.get("explosion_hazards", "")),
            ("Special Fire Fighting Procedures", data.get("fire_procedures", "")),
        ]),
        ("6", "Accidental Release Measures", [
            ("Spill Or Leak Procedures", data.get("spill_procedures", "")),
        ]),
        ("7", "Handling and Storage", [
            ("Storage Temperature", data.get("storage_temp", "")),
            ("Shelf Life", data.get("shelf_life", "")),
            ("Special Sensitivity", data.get("special_sensitivity", "")),
            ("Handling & Storage Precautions", data.get("handling_precautions", "")),
        ]),
        ("8", "Exposure Controls / Personal Protection", [
            ("Oral Protection", data.get("oral_protection", "")),
            ("Eye Protection", data.get("eye_protection", "")),
            ("Skin Protection", data.get("skin_protection", "")),
            ("Respiratory / Ventilation", data.get("respiratory", "")),
        ]),
        ("9", "Physical and Chemical Properties", [
            ("Physical Form", data.get("physical_form", "")),
            ("Colour", data.get("colour", "")),
            ("Flash Point", data.get("flash_point", "")),
            ("Corrosion", data.get("corrosion", "")),
            ("Miscibility", data.get("miscibility", "")),
        ]),
        ("10", "Stability and Reactivity", [
            ("Stability", data.get("stability", "")),
            ("Hazardous Polymerization", data.get("hazardous_polymerization", "")),
            ("Incompatibilities", data.get("incompatibilities", "")),
            ("Decomposition", data.get("decomposition", "")),
        ]),
        ("11", "Toxicological Information", [
            ("Acute Oral Toxicity", data.get("oral_toxicity", "")),
            ("Acute Inhalation Toxicity", data.get("inhalation_toxicity", "")),
            ("Acute Dermal Toxicity", data.get("dermal_toxicity", "")),
            ("Eye Contact", data.get("eye_irritation", "")),
            ("Skin Irritation", data.get("skin_irritation", "")),
            ("Skin Sensitization", data.get("skin_sensitization", "")),
        ]),
        ("12", "Ecological Information", "eco"),
        ("13", "Disposal Considerations", [
            ("Waste Disposal Method", data.get("waste_disposal", "")),
            ("Pesticidal Disposal", data.get("pesticidal_disposal", "")),
        ]),
        ("14", "Transport Information", [
            ("Shipping Name", data.get("shipping_name", "")),
            ("Flammability", data.get("flammability", "")),
            ("ADR/RID/IMDG/IATA/DOT", data.get("transport_class", "")),
        ]),
        ("15", "Regulatory Information", [
            ("OSHA Status", data.get("osha", "")),
            ("TSCA Status", data.get("tsca", "")),
            ("CERCLA Reportable Qty", data.get("cercla", "")),
            ("RCRA Status", data.get("rcra", "")),
        ]),
        ("16", "Other Information", "other"),
    ]

    from reportlab.platypus import PageBreak as _PB
    for num, title, rows_data in sections:
        # Section 16 (Other Information) + disclaimer always on a new page
        if rows_data == "other":
            el.append(_PB())
        build_section(num, title, rows_data)
        el.append(Spacer(1, 1*mm))

    doc.build(el, onFirstPage=_msds_header_footer, onLaterPages=_msds_header_footer)
    pdf_bytes = buf.getvalue()

    if draft_id:
        try:
            from .models import EmailDraft, DraftAttachment
            draft = EmailDraft.objects.get(id=draft_id)
            product_name = (data.get('product_name', 'Product') or 'Product').replace(' ', '_')
            filename = f'MSDS_{product_name}.pdf'
            DraftAttachment.objects.filter(draft=draft, filename__startswith='MSDS_').delete()
            att = DraftAttachment(draft=draft, filename=filename, file_size=len(pdf_bytes))
            att.file.save(filename, ContentFile(pdf_bytes), save=True)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f'MSDS attach failed: {e}')

    order_id = data.get('order_id')
    order_item_id = data.get('order_item_id')
    scope = (data.get('scope') or 'both').strip().lower()
    if scope not in ('both', 'client', 'logistic'):
        scope = 'both'
    if order_id:
        try:
            from orders.models import Order, OrderDocument, OrderItem
            order = Order.objects.get(id=order_id)
            product_name = (data.get('product_name', 'Product') or 'Product').replace(' ', '_')
            scope_suffix = '' if scope == 'both' else f'_{scope.capitalize()}'
            filename = f'MSDS_{product_name}{scope_suffix}.pdf'
            order_item = None
            if order_item_id:
                try:
                    order_item = OrderItem.objects.get(id=order_item_id, order=order)
                except OrderItem.DoesNotExist:
                    order_item = None
            if order_item:
                OrderDocument.objects.filter(order=order, doc_type='msds', order_item=order_item, name=filename, is_deleted=False).delete()
            else:
                OrderDocument.objects.filter(order=order, doc_type='msds', order_item__isnull=True, name=filename, is_deleted=False).delete()
            OrderDocument.objects.create(
                order=order, order_item=order_item, doc_type='msds', name=filename,
                file=ContentFile(pdf_bytes, name=filename), uploaded_by=request.user,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f'MSDS order-attach failed: {e}')

    from django.http import HttpResponse
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="MSDS_{data.get("product_name", "Product")}.pdf"'
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
