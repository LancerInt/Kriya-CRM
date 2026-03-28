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
            )

            # Override created_at with the actual email date
            if em.get('date'):
                Communication.objects.filter(id=comm.id).update(created_at=em['date'])

            # Auto-generate AI draft reply for inbound emails with a matched client
            if direction == 'inbound' and client:
                try:
                    _generate_draft_for_email(comm)
                except Exception as e:
                    logger.error(f'Draft generation failed for {comm.id}: {e}')

            # Auto-detect quote request from inbound messages
            if direction == 'inbound':
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

    EmailDraft.objects.create(
        client=communication.client,
        communication=communication,
        subject=reply['subject'],
        body=reply['body'],
        to_email=communication.external_email or '',
        generated_by_ai=True,
    )
    logger.info(f'AI draft generated for email: {communication.subject}')
