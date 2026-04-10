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
    'purge-recycle-bin-daily': {
        'task': 'workflows.purge_recycle_bin',
        'schedule': crontab(hour=2, minute=0),  # 2:00 AM daily
    },
    'auto-archive-non-client-emails': {
        'task': 'workflows.auto_archive_non_client_emails',
        'schedule': crontab(hour=3, minute=0),  # 3:00 AM daily
    },
    'check-stale-tasks-morning': {
        'task': 'workflows.check_stale_tasks',
        'schedule': crontab(hour=9, minute=45),  # 9:45 AM daily
    },
    'check-stale-tasks-evening': {
        'task': 'workflows.check_stale_tasks',
        'schedule': crontab(hour=17, minute=0),  # 5:00 PM daily
    },
    # Sample reply reminder — every minute, fire a notification for samples
    # whose AI reply was sent but the workflow hasn't moved to "Prepared" yet.
    # The task itself enforces the 2-minute (or longer) cool-down before
    # actually sending a reminder, so running every minute is cheap.
    'check-sample-reply-reminders-every-minute': {
        'task': 'samples.check_sample_reply_reminders',
        'schedule': crontab(minute='*'),
    },
    # Daily task due-date reminder — runs at 8:30 AM IST. Fires:
    #   • day-before notifications ("tomorrow is the last date")
    #   • last-day notifications ("today is the last date")
    #   • periodic 5-day nudges for tasks not due soon yet
    # The first reminder (right after assignment) is sent inline by the
    # viewset hooks, not by this task.
    'check-task-due-reminders-daily': {
        'task': 'tasks.check_task_due_reminders',
        'schedule': crontab(hour=8, minute=30),
    },
}
