"""
Backfill historical email for one (or all) EmailAccount(s).

Hands the work off to the existing ``communications.historical_sync_emails``
Celery task — this command is just a friendly wrapper so you can fire the
backfill from the Render shell without typing the task signature by hand.

Usage:
    # Backfill 5 years for every active account (queued on Celery worker)
    python manage.py backfill_emails --days 1825

    # Backfill 1 year for a single account
    python manage.py backfill_emails --email moulee@kriya.ltd --days 365

    # Run synchronously in this process instead of queuing (long-running)
    python manage.py backfill_emails --email moulee@kriya.ltd --days 1825 --sync

Notes:
    * Mail dated on/before settings.BACKFILL_CUTOFF_DATE is treated as
      historical: rows are stored but no auto-quote / PI / PO / AI draft /
      sample / notification fires (see communications/backfill_guard.py).
    * The IMAP fetch is idempotent — already-imported messages are skipped
      by message_id, so you can re-run the command safely.
    * For large pulls (1+ year) prefer the default queued mode so the
      Celery worker handles it. A 5-year pull on a busy inbox can take
      hours; the worker survives web restarts, this shell does not.
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Pull historical email for one or all EmailAccounts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            default='',
            help='Backfill only this account address. If omitted, every active EmailAccount is backfilled.',
        )
        parser.add_argument(
            '--days',
            type=int,
            default=1825,
            help='How many days of history to pull. Default 1825 (=5 years).',
        )
        parser.add_argument(
            '--sync',
            action='store_true',
            help='Run inline in this process instead of dispatching to Celery. Slow but useful for debugging.',
        )

    def handle(self, *args, **opts):
        from communications.models import EmailAccount
        from communications.tasks import historical_sync_emails

        days = opts['days']
        if days <= 0:
            raise CommandError('--days must be a positive integer')

        accounts = EmailAccount.objects.filter(is_active=True)
        if opts['email']:
            accounts = accounts.filter(email__iexact=opts['email'])

        accounts = list(accounts)
        if not accounts:
            raise CommandError(
                'No active EmailAccount matched. Add the account in the CRM '
                'Settings → Email Accounts page first.'
            )

        self.stdout.write(self.style.NOTICE(
            f'Backfilling {days} day(s) for {len(accounts)} account(s)...'
        ))

        for account in accounts:
            label = f'{account.email} (id={account.id})'
            if opts['sync']:
                self.stdout.write(f'  → Running inline for {label}')
                try:
                    result = historical_sync_emails(str(account.id), days)
                except Exception as exc:
                    self.stdout.write(self.style.ERROR(f'    failed: {exc}'))
                    continue
                self.stdout.write(self.style.SUCCESS(f'    done: {result}'))
            else:
                async_result = historical_sync_emails.delay(str(account.id), days)
                self.stdout.write(self.style.SUCCESS(
                    f'  → Queued for {label} (task id: {async_result.id})'
                ))

        self.stdout.write('')
        if opts['sync']:
            self.stdout.write(self.style.SUCCESS('All accounts processed.'))
        else:
            self.stdout.write(self.style.SUCCESS(
                'All accounts queued. Watch progress in:\n'
                '  • CRM → Settings → Email Accounts (sync banner)\n'
                '  • Render → kriya-crm-worker → Logs\n'
                '  • EmailAccount.historical_sync_status / .historical_sync_imported'
            ))
