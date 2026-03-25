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
        days_overdue = (now - task.due_date).days
        priority_label = task.priority.upper()

        # Determine urgency based on priority
        if task.priority == 'urgent' or days_overdue > 7:
            alert_title = f'URGENT: Task overdue ({days_overdue}d) - {task.title[:60]}'
        elif task.priority == 'high' or days_overdue > 3:
            alert_title = f'HIGH: Task overdue ({days_overdue}d) - {task.title[:60]}'
        else:
            alert_title = f'Task overdue ({days_overdue}d): {task.title[:60]}'

        alert_msg = f'[{priority_label}] "{task.title}" (client: {client_name}) was due {task.due_date.strftime("%Y-%m-%d")} and is still {task.status}. {days_overdue} day(s) overdue.'

        # Notify task owner
        Notification.objects.create(
            user=task.owner,
            notification_type='alert',
            title=alert_title,
            message=alert_msg,
            link=f'/tasks',
        )
        created_count += 1

        # Notify task creator (if different from owner)
        if task.created_by and task.created_by != task.owner:
            Notification.objects.create(
                user=task.created_by,
                notification_type='alert',
                title=alert_title,
                message=f'{alert_msg} Assigned to: {task.owner.full_name}.',
                link=f'/tasks',
            )
            created_count += 1

        # Notify main executive of the client (if different)
        if task.client and task.client.primary_executive:
            pe = task.client.primary_executive
            if pe != task.owner and pe != task.created_by:
                Notification.objects.create(
                    user=pe,
                    notification_type='alert',
                    title=alert_title,
                    message=f'{alert_msg} Assigned to: {task.owner.full_name}.',
                    link=f'/clients/{task.client.id}',
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


@shared_task(name='workflows.scan_emails_for_alerts')
def scan_emails_for_alerts():
    """
    Scan recent emails for keywords related to samples, shipment deadlines,
    payment balances, etc. and create color-coded alerts.
    """
    from communications.models import Communication
    from notifications.models import Notification
    from accounts.models import User
    from datetime import timedelta

    now = timezone.now()
    # Only scan emails from last 24 hours that haven't been scanned
    recent_emails = Communication.objects.filter(
        comm_type='email',
        direction='inbound',
        created_at__gte=now - timedelta(hours=24),
    ).select_related('client', 'user')

    keywords_config = [
        {
            'keywords': ['sample request', 'sample requisition', 'send sample', 'need sample', 'require sample'],
            'alert_type': 'reminder',
            'title_prefix': 'Sample Request',
            'priority': 'medium',
        },
        {
            'keywords': ['shipment deadline', 'delivery date', 'dispatch by', 'ship by', 'urgent shipment', 'shipping delay'],
            'alert_type': 'alert',
            'title_prefix': 'Shipment Deadline',
            'priority': 'high',
        },
        {
            'keywords': ['payment pending', 'payment balance', 'outstanding payment', 'overdue payment', 'payment reminder', 'pay balance'],
            'alert_type': 'alert',
            'title_prefix': 'Payment Alert',
            'priority': 'urgent',
        },
        {
            'keywords': ['price change', 'price revision', 'rate change', 'new price', 'price increase'],
            'alert_type': 'reminder',
            'title_prefix': 'Price Change',
            'priority': 'medium',
        },
        {
            'keywords': ['quality issue', 'complaint', 'defect', 'reject', 'non-conformance', 'quality concern'],
            'alert_type': 'alert',
            'title_prefix': 'Quality Issue',
            'priority': 'high',
        },
    ]

    alert_count = 0
    admins_managers = User.objects.filter(role__in=['admin', 'manager'], is_active=True)

    for email in recent_emails:
        text = f"{email.subject} {email.body}".lower()
        client_name = email.client.company_name if email.client else 'Unknown'

        for config in keywords_config:
            matched = [kw for kw in config['keywords'] if kw in text]
            if not matched:
                continue

            # Check if alert already exists for this email
            alert_link = f'/communications'
            already = Notification.objects.filter(
                title__startswith=config['title_prefix'],
                message__icontains=email.subject[:50],
                created_at__gte=now - timedelta(hours=24),
            ).exists()

            if already:
                continue

            alert_msg = f'Email from {email.external_email or "client"} ({client_name}): "{email.subject[:80]}". Detected: {", ".join(matched[:3])}.'

            # Notify the client's primary executive
            notified = set()
            if email.client and email.client.primary_executive:
                Notification.objects.create(
                    user=email.client.primary_executive,
                    notification_type=config['alert_type'],
                    title=f'{config["title_prefix"]}: {client_name}',
                    message=alert_msg,
                    link=alert_link,
                )
                notified.add(email.client.primary_executive.id)
                alert_count += 1

            # Notify shadow executive
            if email.client and email.client.shadow_executive and email.client.shadow_executive.id not in notified:
                Notification.objects.create(
                    user=email.client.shadow_executive,
                    notification_type=config['alert_type'],
                    title=f'{config["title_prefix"]}: {client_name}',
                    message=alert_msg,
                    link=alert_link,
                )
                notified.add(email.client.shadow_executive.id)
                alert_count += 1

            # For urgent/high priority, also notify admins and managers
            if config['priority'] in ('urgent', 'high'):
                for admin in admins_managers:
                    if admin.id not in notified:
                        Notification.objects.create(
                            user=admin,
                            notification_type=config['alert_type'],
                            title=f'{config["title_prefix"]}: {client_name}',
                            message=alert_msg,
                            link=alert_link,
                        )
                        alert_count += 1

    logger.info(f"scan_emails_for_alerts: {alert_count} email intelligence alerts created")
    return f'{alert_count} email alerts created'


@shared_task(name='workflows.auto_pipeline_from_emails')
def auto_pipeline_from_emails():
    """
    Scan inbound emails and auto-create/advance pipeline inquiries.
    Detects: new product inquiries, quotation requests, sample requests,
    order confirmations, negotiation signals.
    """
    from communications.models import Communication
    from quotations.models import Inquiry
    from notifications.models import Notification
    from products.models import Product
    from datetime import timedelta

    now = timezone.now()
    # Only scan emails from last 30 minutes (runs every 15 min, overlap for safety)
    recent_emails = Communication.objects.filter(
        comm_type='email',
        direction='inbound',
        created_at__gte=now - timedelta(minutes=30),
        client__isnull=False,
    ).select_related('client')

    # Pipeline stage detection keywords
    STAGE_KEYWORDS = {
        'order_confirmed': [
            'confirm order', 'confirmed order', 'place order', 'order confirmed',
            'proceed with order', 'go ahead with order', 'we confirm', 'purchase order',
            'please proceed', 'accept the quotation', 'accept quotation',
        ],
        'negotiation': [
            'negotiate', 'better price', 'discount', 'reduce price', 'best price',
            'lower rate', 'final price', 'revised price', 'counter offer',
        ],
        'quotation': [
            'send quotation', 'send quote', 'price list', 'pricing', 'your price',
            'quotation for', 'quote for', 'request quotation', 'need quotation',
        ],
        'sample': [
            'send sample', 'sample request', 'need sample', 'require sample',
            'test sample', 'trial order', 'sample shipment',
        ],
        'discussion': [
            'interested in', 'inquire about', 'inquiry about', 'information about',
            'details about', 'tell me about', 'know more', 'product details',
            'availability', 'do you have', 'can you supply',
        ],
    }

    created_count = 0
    advanced_count = 0

    for email in recent_emails:
        text = f"{email.subject} {email.body}".lower()
        text = text.replace('<br>', ' ').replace('<br/>', ' ')
        # Strip HTML tags
        import re
        text = re.sub(r'<[^>]+>', ' ', text)

        client = email.client
        client_name = client.company_name

        # Detect which stage this email matches
        detected_stage = None
        for stage, keywords in STAGE_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                detected_stage = stage
                break

        if not detected_stage:
            continue

        # Check if there's already an active inquiry for this client
        existing = Inquiry.objects.filter(
            client=client,
            stage__in=['inquiry', 'discussion', 'sample', 'quotation', 'negotiation'],
        ).order_by('-updated_at').first()

        # Try to detect product from email
        products = Product.objects.filter(is_deleted=False)
        matched_product = None
        for p in products:
            if p.name.lower() in text or (p.active_ingredient and p.active_ingredient.lower() in text):
                matched_product = p
                break

        stage_order = ['inquiry', 'discussion', 'sample', 'quotation', 'negotiation', 'order_confirmed']

        if existing:
            # Only advance forward, never backward
            current_idx = stage_order.index(existing.stage) if existing.stage in stage_order else -1
            new_idx = stage_order.index(detected_stage) if detected_stage in stage_order else -1

            if new_idx > current_idx:
                old_stage = existing.stage
                existing.stage = detected_stage
                if matched_product and not existing.product:
                    existing.product = matched_product
                    existing.product_name = matched_product.name
                existing.save()
                advanced_count += 1

                # Notify assigned executive
                if existing.assigned_to:
                    Notification.objects.create(
                        user=existing.assigned_to,
                        notification_type='system',
                        title=f'Pipeline: {client_name} moved to {detected_stage}',
                        message=f'Inquiry for {client_name} auto-advanced from "{old_stage}" to "{detected_stage}" based on email: "{email.subject[:60]}"',
                        link='/pipeline',
                    )
        else:
            # Create new inquiry
            source = 'email'
            assigned_to = client.primary_executive

            inquiry = Inquiry.objects.create(
                client=client,
                source=source,
                stage=detected_stage,
                assigned_to=assigned_to,
                product=matched_product,
                product_name=matched_product.name if matched_product else '',
                requirements=f'Auto-detected from email: "{email.subject}"',
            )
            created_count += 1

            # Notify
            if assigned_to:
                Notification.objects.create(
                    user=assigned_to,
                    notification_type='system',
                    title=f'New inquiry: {client_name}',
                    message=f'Auto-created inquiry for {client_name} (stage: {detected_stage}) from email: "{email.subject[:60]}"',
                    link='/pipeline',
                )

    logger.info(f"auto_pipeline_from_emails: {created_count} created, {advanced_count} advanced")
    return f'{created_count} inquiries created, {advanced_count} advanced'


@shared_task(name='workflows.check_meeting_reminders')
def check_meeting_reminders():
    """
    Send meeting reminders at 20h, 4h before the meeting.
    """
    from meetings.models import CallLog
    from notifications.models import Notification
    from accounts.models import User
    from datetime import timedelta

    now = timezone.now()
    all_users = list(User.objects.filter(is_active=True))

    # Check windows: 20h before (19-21h window), 4h before (3-5h window)
    reminder_windows = [
        {'hours_before': 20, 'label': 'tomorrow', 'window_mins': 60},
        {'hours_before': 4, 'label': 'in 4 hours', 'window_mins': 60},
    ]

    reminder_count = 0

    for window in reminder_windows:
        target_time = now + timedelta(hours=window['hours_before'])
        window_start = target_time - timedelta(minutes=window['window_mins'] // 2)
        window_end = target_time + timedelta(minutes=window['window_mins'] // 2)

        upcoming_meetings = CallLog.objects.filter(
            status='scheduled',
            scheduled_at__gte=window_start,
            scheduled_at__lte=window_end,
        ).select_related('client', 'user')

        for meeting in upcoming_meetings:
            client_name = meeting.client.company_name if meeting.client else 'Unknown'
            time_str = meeting.scheduled_at.strftime('%B %d, %Y at %I:%M %p')
            platform = meeting.get_platform_display()

            # Check if reminder already sent for this window
            ref_tag = f'{str(meeting.id)[:8]}_{window["label"]}'
            already = Notification.objects.filter(
                title__icontains='Meeting Reminder',
                message__icontains=ref_tag,
                created_at__gte=now - timedelta(hours=2),
            ).exists()
            if already:
                continue

            # Notify ALL users
            for user in all_users:
                Notification.objects.create(
                    user=user,
                    notification_type='reminder',
                    title=f'Meeting Reminder: {meeting.agenda or client_name}',
                    message=f'Meeting with {client_name} is {window["label"]} ({time_str}) via {platform}. {f"Link: {meeting.meeting_link}" if meeting.meeting_link else ""} [ref:{str(meeting.id)[:8]}_{window["label"]}]',
                    link='/team-chat' if meeting.meeting_link else '/meetings',
                )
            reminder_count += len(all_users)

    logger.info(f"check_meeting_reminders: {reminder_count} meeting reminders sent")
    return f'{reminder_count} meeting reminders sent'


@shared_task(name='workflows.purge_recycle_bin')
def purge_recycle_bin():
    """Permanently delete items that have been in recycle bin for over 30 days."""
    from common.recycle_bin import auto_purge_expired
    count = auto_purge_expired()
    logger.info(f"purge_recycle_bin: {count} expired items permanently deleted")
    return f'{count} expired items purged'
