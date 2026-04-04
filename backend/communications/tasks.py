from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task(name='communications.sync_emails')
def sync_emails(email_account_id=None):
    """Sync emails from IMAP for one or all active EmailAccounts."""
    from communications.models import EmailAccount, Communication
    from communications.services import EmailService, ContactMatcher
    from django.utils import timezone

    if email_account_id:
        accounts = EmailAccount.objects.filter(id=email_account_id, is_active=True)
    else:
        accounts = EmailAccount.objects.filter(is_active=True)

    total_synced = 0
    for account in accounts:
        emails = EmailService.fetch_emails(account)
        for em in emails:
            # Dedup by message_id (primary)
            if em['message_id'] and Communication.objects.filter(
                email_message_id=em['message_id']
            ).exists():
                continue

            # Dedup fallback: same subject + sender + date (within 1 minute)
            if not em['message_id']:
                from datetime import timedelta
                exists = Communication.objects.filter(
                    subject=em['subject'],
                    external_email__in=[em['from_email'], em['to_email']],
                    created_at__gte=em['date'] - timedelta(minutes=1),
                    created_at__lte=em['date'] + timedelta(minutes=1),
                ).exists()
                if exists:
                    continue

            # Determine direction from folder or sender
            if em.get('default_direction') == 'outbound' or em['from_email'].lower() == account.email.lower():
                direction = 'outbound'
                external = em['to_email']
            else:
                direction = 'inbound'
                external = em['from_email']

            # Match to client
            client, contact = ContactMatcher.match_by_email(external)

            # Classify the email
            from communications.email_classifier import classify_email
            classification = classify_email(
                sender_email=external,
                subject=em['subject'],
                body=em['body'],
                client_matched=client is not None,
                contact_matched=contact is not None,
            )

            comm = Communication.objects.create(
                client=client,
                contact=contact,
                user=account.user,
                comm_type='email',
                direction=direction,
                subject=em['subject'],
                body=em['body'],
                status='received' if direction == 'inbound' else 'sent',
                email_message_id=em['message_id'],
                email_in_reply_to=em['in_reply_to'],
                email_account=account,
                external_email=external,
                email_cc=em.get('cc', ''),
                is_client_mail=classification['is_client_mail'],
                classification=classification['classification'],
                is_classified=True,
                is_read=(direction == 'outbound'),
            )

            # Override created_at with the actual email date
            if em.get('date'):
                Communication.objects.filter(id=comm.id).update(created_at=em['date'])

            # Auto-archive if sender is in the archived senders list
            if direction == 'inbound' and external:
                from communications.models import ArchivedSender
                if ArchivedSender.objects.filter(email__iexact=external).exists():
                    comm.soft_delete()
                    logger.info(f'Auto-archived email from {external} (sender in archive list)')
                    total_synced += 1
                    continue

            # Auto-create contact if client matched but no contact
            if client and not contact and direction == 'inbound':
                try:
                    from communications.views import _auto_create_contact
                    _auto_create_contact(client, comm)
                except Exception as e:
                    logger.error(f'Auto-contact creation failed for {comm.id}: {e}')

            # Notify executive about new inbound email from client
            if direction == 'inbound' and client:
                try:
                    from notifications.helpers import notify
                    notify(
                        title=f'New email from {external}',
                        message=f'{em["subject"][:80]}' if em.get('subject') else 'New email received',
                        notification_type='system',
                        link=f'/clients/{client.id}',
                        client=client,
                    )
                except Exception as e:
                    logger.error(f'Email notification failed: {e}')

            # Auto-generate AI draft reply for inbound emails with a matched client
            if direction == 'inbound' and client:
                try:
                    _generate_draft_for_email(comm)
                except Exception as e:
                    logger.error(f'Draft generation failed for {comm.id}: {e}')

            # Auto-detect PI request first (takes priority over quote request)
            pi_created = False
            if direction == 'inbound' and client:
                try:
                    from communications.auto_pi_service import process_communication_for_pi
                    pi_result = process_communication_for_pi(comm)
                    if pi_result:
                        pi_created = True
                except Exception as e:
                    logger.error(f'PI request detection failed for {comm.id}: {e}')

            # Auto-detect quote request from inbound messages (skip if PI was detected)
            if direction == 'inbound' and not pi_created:
                try:
                    from communications.auto_quote_service import process_communication_for_quote
                    process_communication_for_quote(comm)
                except Exception as e:
                    logger.error(f'Quote request detection failed for {comm.id}: {e}')

            total_synced += 1

        account.last_synced = timezone.now()
        account.save(update_fields=['last_synced'])

    logger.info(f'Email sync complete: {total_synced} new emails synced')
    return f'{total_synced} emails synced'


def _generate_draft_for_email(communication):
    """Generate an AI draft reply for an incoming email."""
    from communications.models import EmailDraft
    from communications.ai_email_service import generate_email_reply

    # Don't generate if draft already exists
    if EmailDraft.objects.filter(communication=communication).exists():
        return

    reply = generate_email_reply(communication)

    # Build CC: other client contacts + admin/manager emails
    cc = ''
    if communication.client:
        from communications.services import get_client_email_recipients
        to_email, _, cc = get_client_email_recipients(
            communication.client, source_communication=communication
        )

    EmailDraft.objects.create(
        client=communication.client,
        communication=communication,
        subject=reply['subject'],
        body=reply['body'],
        to_email=communication.external_email or '',
        cc=cc,
        generated_by_ai=True,
    )
    logger.info(f'AI draft generated for email: {communication.subject}')
