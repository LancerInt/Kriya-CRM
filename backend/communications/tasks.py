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
            # Dedup by message_id
            if em['message_id'] and Communication.objects.filter(
                email_message_id=em['message_id']
            ).exists():
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

            Communication.objects.create(
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
            )
            total_synced += 1

        account.last_synced = timezone.now()
        account.save(update_fields=['last_synced'])

    logger.info(f'Email sync complete: {total_synced} new emails synced')
    return f'{total_synced} emails synced'
