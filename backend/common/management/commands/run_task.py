"""
Synchronously invoke a Celery task function — no Celery worker required.

Designed for Render's free-tier Cron Jobs (which can't spin up Background
Workers). Each scheduled task becomes a one-liner cron command:

    python manage.py run_task orders.tasks.check_balance_payment_reminders

The task runs inline in this process. Logs go to stdout (Render captures
them). Exit code 0 on success, 1 on failure.

Works for any function — it doesn't have to be a @shared_task. We import
the module and call the function with no args. If the task accepts kwargs
in the future, extend the signature; for now everything in the scheduler
is no-arg.
"""
import importlib
import logging
import sys
import traceback

from django.core.management.base import BaseCommand, CommandError

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Run a Celery task (or any callable) synchronously by its dotted path. "
        "Used by Render Cron Jobs on the free tier instead of celery beat."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            'task_path',
            help='Dotted path to the callable, e.g. orders.tasks.check_balance_payment_reminders',
        )

    def handle(self, *args, **options):
        path = options['task_path']
        if '.' not in path:
            raise CommandError(
                f'task_path must be a dotted module.function path, got: {path!r}'
            )
        module_path, func_name = path.rsplit('.', 1)
        try:
            mod = importlib.import_module(module_path)
        except ImportError as e:
            raise CommandError(f'Could not import {module_path!r}: {e}')
        func = getattr(mod, func_name, None)
        if func is None or not callable(func):
            raise CommandError(f'{module_path}.{func_name} is not callable.')

        self.stdout.write(self.style.HTTP_INFO(f'▶ Running {path}'))
        try:
            result = func()
        except Exception:
            self.stderr.write(self.style.ERROR(f'✗ {path} raised:'))
            self.stderr.write(traceback.format_exc())
            sys.exit(1)
        self.stdout.write(self.style.SUCCESS(f'✓ {path} done. Result: {result!r}'))
