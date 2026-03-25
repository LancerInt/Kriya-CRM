import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')

app = Celery('kriya_crm')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Periodic task schedule (Celery Beat)
app.conf.beat_schedule = {
    'check-overdue-tasks-daily': {
        'task': 'workflows.check_overdue_tasks',
        'schedule': crontab(hour=9, minute=0),  # Every day at 9:00 AM IST
        'options': {'queue': 'default'},
    },
    'check-overdue-invoices-daily': {
        'task': 'workflows.check_overdue_invoices',
        'schedule': crontab(hour=9, minute=30),  # Every day at 9:30 AM IST
        'options': {'queue': 'default'},
    },
    'sync-emails-every-5-minutes': {
        'task': 'communications.sync_emails',
        'schedule': crontab(minute='*/5'),
    },
    'scan-emails-for-alerts-every-15-minutes': {
        'task': 'workflows.scan_emails_for_alerts',
        'schedule': crontab(minute='*/15'),
    },
    'auto-pipeline-from-emails-every-15-minutes': {
        'task': 'workflows.auto_pipeline_from_emails',
        'schedule': crontab(minute='*/15'),
    },
    'check-meeting-reminders-every-30-minutes': {
        'task': 'workflows.check_meeting_reminders',
        'schedule': crontab(minute='*/30'),
    },
}
