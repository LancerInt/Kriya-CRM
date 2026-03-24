"""
Celery periodic tasks for workflow automations.

- check_overdue_tasks: finds tasks past due_date still pending/in_progress, creates alert notifications
- check_overdue_invoices: finds invoices past due_date, updates status to overdue, creates notifications
"""
import logging
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name='workflows.check_overdue_tasks')
def check_overdue_tasks():
    """
    Find tasks that are past their due_date and still pending or in_progress.
    Create alert notifications for the task owners.
    """
    from tasks.models import Task
    from notifications.models import Notification

    now = timezone.now()
    overdue_tasks = Task.objects.filter(
        due_date__lt=now,
        status__in=['pending', 'in_progress'],
    ).select_related('owner', 'client')

    created_count = 0
    for task in overdue_tasks:
        if not task.owner:
            continue

        # Avoid duplicate notifications: check if an overdue notification was
        # already created for this task today
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        already_notified = Notification.objects.filter(
            user=task.owner,
            notification_type='alert',
            title__icontains='overdue',
            link=f'/tasks/{task.id}',
            created_at__gte=today_start,
        ).exists()

        if already_notified:
            continue

        client_name = task.client.company_name if task.client else 'N/A'
        Notification.objects.create(
            user=task.owner,
            notification_type='alert',
            title=f'Task overdue: {task.title[:80]}',
            message=f'Task "{task.title}" (client: {client_name}) was due on {task.due_date.strftime("%Y-%m-%d %H:%M")} and is still {task.status}.',
            link=f'/tasks/{task.id}',
        )
        created_count += 1

    logger.info(f"check_overdue_tasks: {created_count} overdue notifications created")
    return f'{created_count} overdue task notifications created'


@shared_task(name='workflows.check_overdue_invoices')
def check_overdue_invoices():
    """
    Find invoices that are past their due_date and still in draft/sent/partial status.
    Update their status to overdue and create notifications.
    """
    from finance.models import Invoice
    from notifications.models import Notification

    today = timezone.now().date()
    overdue_invoices = Invoice.objects.filter(
        due_date__lt=today,
        status__in=['draft', 'sent', 'partial'],
    ).select_related('client', 'created_by')

    updated_count = 0
    notified_count = 0

    for invoice in overdue_invoices:
        # Update status to overdue
        if invoice.status != 'overdue':
            invoice.status = 'overdue'
            invoice.save(update_fields=['status', 'updated_at'])
            updated_count += 1

        if not invoice.created_by:
            continue

        # Avoid duplicate notifications today
        today_start = timezone.now().replace(hour=0, minute=0, second=0, microsecond=0)
        already_notified = Notification.objects.filter(
            user=invoice.created_by,
            notification_type='alert',
            link=f'/finance/invoices/{invoice.id}',
            created_at__gte=today_start,
        ).exists()

        if already_notified:
            continue

        Notification.objects.create(
            user=invoice.created_by,
            notification_type='alert',
            title=f'Invoice overdue: {invoice.invoice_number}',
            message=f'Invoice {invoice.invoice_number} for {invoice.client.company_name} (total: {invoice.total} {invoice.currency}) was due on {invoice.due_date} and is now overdue.',
            link=f'/finance/invoices/{invoice.id}',
        )
        notified_count += 1

    logger.info(f"check_overdue_invoices: {updated_count} invoices marked overdue, {notified_count} notifications created")
    return f'{updated_count} invoices marked overdue, {notified_count} notifications created'
