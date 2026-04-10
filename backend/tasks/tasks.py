"""
Periodic Celery tasks for the Tasks app.

Runs once per day to fire due-date reminders to task owners according to
the cadence the product asked for:

  • The first reminder is fired immediately at assignment time (handled by
    the viewset perform_create / perform_update hooks, not this task).
  • The day BEFORE the due date → "tomorrow is the last date".
  • On the due date itself → "today is the last date".
  • For tasks that aren't due soon yet, we only nudge once every 5 days
    after the assignment so the assignee isn't bombarded.
  • No reminders are sent for completed / cancelled tasks.
"""
import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name='tasks.check_task_due_reminders')
def check_task_due_reminders():
    """Daily tick — fire the next reminder for every active task that needs one."""
    from .models import Task
    from .notifications import notify_task_due_reminder

    now = timezone.now()
    today = now.date()
    tomorrow = today + timedelta(days=1)

    # Only consider open tasks with a real due date
    qs = Task.objects.filter(
        is_deleted=False,
        status__in=['pending', 'in_progress'],
        due_date__isnull=False,
        owner__isnull=False,
    ).select_related('owner', 'client', 'created_by')

    fired = 0
    skipped = 0

    for task in qs:
        try:
            due_date = task.due_date.date() if hasattr(task.due_date, 'date') else task.due_date
        except Exception:
            continue

        # Skip if already overdue (the existing workflows.check_overdue_tasks
        # task handles those — no point double-pinging the assignee).
        if due_date < today:
            skipped += 1
            continue

        # Idempotency: did we already fire a reminder today?
        if task.last_reminder_sent_at and task.last_reminder_sent_at.date() == today:
            skipped += 1
            continue

        kind = None
        if due_date == today:
            kind = 'last_day'
        elif due_date == tomorrow:
            kind = 'day_before'
        else:
            # Periodic 5-day nudge based on the assigned_at baseline.
            # Falls back to created_at when the task was assigned via a path
            # that didn't stamp assigned_at (older rows).
            baseline = task.assigned_at or task.last_reminder_sent_at or task.created_at
            if baseline:
                days_since_baseline = (now - baseline).days
                # 5, 10, 15, … days since the last touch
                if days_since_baseline >= 5 and days_since_baseline % 5 == 0:
                    kind = 'periodic'

        if not kind:
            skipped += 1
            continue

        try:
            notify_task_due_reminder(task, kind=kind)
            fired += 1
        except Exception as e:
            logger.warning(f'Task reminder failed for {task.id}: {e}')

    logger.info(f'Task due reminders — fired={fired} skipped={skipped}')
    return f'fired={fired} skipped={skipped}'
