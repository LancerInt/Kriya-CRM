"""
Task notifications — in-app + email.

Centralizes the logic for telling task owners about:
- New task assignments
- Due-date reminders (last day, day-before, every-5-days cadence)
- Completion confirmations

Used by both the TaskViewSet (for instant assignment / completion notifications)
and the periodic Celery task (for daily due-date reminder ticks).
"""
import logging
from datetime import timedelta
from django.utils import timezone

logger = logging.getLogger(__name__)


# ── Email helpers ─────────────────────────────────────────────────────────

def _send_task_email(to_user, subject, body_html, actor=None):
    """Send a task-related email via the active SMTP account.

    Tries the actor's email account first, falls back to any active account.
    Silently logs and returns False on failure so notification flows are
    never blocked by SMTP issues.
    """
    if not to_user or not to_user.email:
        return False
    try:
        from communications.models import EmailAccount
        from communications.services import EmailService
        from communications.signature import append_signature

        account = None
        if actor:
            account = EmailAccount.objects.filter(user=actor, is_active=True).first()
        if not account:
            account = EmailAccount.objects.filter(is_active=True).first()
        if not account:
            logger.warning('No active EmailAccount configured — skipping task email')
            return False

        body_with_sig = append_signature(body_html, actor)
        EmailService.send_email(
            email_account=account,
            to=to_user.email,
            subject=subject,
            body_html=body_with_sig,
        )
        return True
    except Exception as e:
        logger.warning(f'Task email send failed for {to_user.email}: {e}')
        return False


def _format_due(due_date):
    if not due_date:
        return ''
    try:
        return due_date.strftime('%a, %b %d %Y at %I:%M %p')
    except Exception:
        return str(due_date)


# ── Notification entry points ─────────────────────────────────────────────

def notify_task_assigned(task, actor=None, is_reassignment=False):
    """Fire when a task is assigned to its owner (create or owner change).

    - Creates an in-app notification for the owner
    - Sends an email to the owner with the task title, due date, and link
    - Stamps `task.assigned_at` so the daily reminder cadence has a baseline
    - Resets `task.last_reminder_sent_at` so the day-of reminder isn't skipped
    """
    if not task or not task.owner_id:
        return

    from notifications.helpers import notify

    verb = 'reassigned' if is_reassignment else 'assigned'
    actor_name = actor.full_name if actor else 'System'
    due_str = _format_due(task.due_date)
    due_line = f' Deadline: <strong>{due_str}</strong>.' if due_str else ''

    title = f'Task {verb}: {task.title}'
    in_app_msg = (
        f'{actor_name} {verb} you a task'
        + (f' due {due_str}' if due_str else '') + '.'
    )
    email_body = f"""
        <p>Hi {task.owner.full_name},</p>
        <p>{actor_name} has {verb} you a new task:</p>
        <div style="background:#f9fafb;border-left:3px solid #6366f1;padding:12px 16px;margin:12px 0;">
            <p style="margin:0 0 4px 0;font-weight:600;font-size:15px;">{task.title}</p>
            {f'<p style="margin:0;color:#555;">{task.description}</p>' if task.description else ''}
            {f'<p style="margin:8px 0 0 0;color:#374151;"><strong>Priority:</strong> {task.priority.title()}</p>' if task.priority else ''}
            {f'<p style="margin:4px 0 0 0;color:#374151;"><strong>Due:</strong> {due_str}</p>' if due_str else ''}
            {f'<p style="margin:4px 0 0 0;color:#374151;"><strong>Client:</strong> {task.client.company_name}</p>' if task.client else ''}
        </div>
        <p>Please review and update the status when you start working on it.</p>
    """

    # In-app notification
    try:
        notify(
            title=title,
            message=in_app_msg + due_line.replace('<strong>', '').replace('</strong>', ''),
            notification_type='task',
            link=f'/tasks',
            actor=actor,
            client=task.client,
            extra_users=[task.owner],
        )
    except Exception as e:
        logger.warning(f'In-app notify failed for task {task.id}: {e}')

    # Email
    _send_task_email(task.owner, title, email_body, actor=actor)

    # Stamp the assignment timestamps so the reminder cadence has a baseline
    from .models import Task
    Task.objects.filter(id=task.id).update(
        assigned_at=timezone.now(),
        last_reminder_sent_at=None,
    )


def notify_task_due_reminder(task, kind):
    """Fire a due-date reminder. `kind` is one of:
        'first'      — initial due-date heads-up (right after assignment)
        'day_before' — 'tomorrow is the last date'
        'last_day'   — 'today is the last date'
        'periodic'   — every-5-days check-in
    """
    if not task or not task.owner_id:
        return

    from notifications.helpers import notify
    from .models import Task

    due_str = _format_due(task.due_date)
    if kind == 'first':
        title = f'Task deadline: {task.title}'
        msg = f'You have a task due {due_str}.'
        body_intro = f'<p>This is a reminder of an upcoming task deadline.</p>'
    elif kind == 'day_before':
        title = f'Reminder: tomorrow is the last date — {task.title}'
        msg = f'Tomorrow is the last date for "{task.title}". Please complete it soon.'
        body_intro = f'<p><strong>Tomorrow</strong> is the last date for this task. Please make sure to complete it on time.</p>'
    elif kind == 'last_day':
        title = f'Today is the deadline: {task.title}'
        msg = f'Today is the last date for "{task.title}". Please complete it as soon as possible.'
        body_intro = f'<p><strong>Today</strong> is the last date for this task. Please complete it as soon as possible.</p>'
    elif kind == 'periodic':
        days_left = (task.due_date - timezone.now()).days if task.due_date else None
        suffix = f' ({days_left} days remaining)' if days_left is not None and days_left > 0 else ''
        title = f'Task reminder{suffix}: {task.title}'
        msg = f'You still have an open task: "{task.title}".' + (f' {days_left} days remaining.' if days_left else '')
        body_intro = f'<p>You still have an open task assigned to you.</p>'
    else:
        return

    email_body = f"""
        <p>Hi {task.owner.full_name},</p>
        {body_intro}
        <div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:12px 16px;margin:12px 0;">
            <p style="margin:0 0 4px 0;font-weight:600;font-size:15px;">{task.title}</p>
            {f'<p style="margin:0;color:#555;">{task.description}</p>' if task.description else ''}
            {f'<p style="margin:8px 0 0 0;color:#374151;"><strong>Due:</strong> {due_str}</p>' if due_str else ''}
            {f'<p style="margin:4px 0 0 0;color:#374151;"><strong>Priority:</strong> {task.priority.title()}</p>' if task.priority else ''}
            {f'<p style="margin:4px 0 0 0;color:#374151;"><strong>Client:</strong> {task.client.company_name}</p>' if task.client else ''}
        </div>
        <p>Please update the task status once you have completed it.</p>
    """

    try:
        notify(
            title=title,
            message=msg,
            notification_type='reminder',
            link=f'/tasks',
            client=task.client,
            extra_users=[task.owner],
        )
    except Exception as e:
        logger.warning(f'In-app reminder failed for task {task.id}: {e}')

    _send_task_email(task.owner, title, email_body, actor=None)
    Task.objects.filter(id=task.id).update(last_reminder_sent_at=timezone.now())


def notify_task_completed(task, actor=None):
    """Fire when a task transitions to completed.

    Notifies BOTH the original creator and the assignee (so the executive
    knows their work is acknowledged, and the assigner knows it's done).
    """
    if not task:
        return
    from notifications.helpers import notify

    actor_name = actor.full_name if actor else 'Someone'
    title = f'Task completed: {task.title}'
    msg = f'{actor_name} completed the task "{task.title}".'
    email_body = f"""
        <p>Hi,</p>
        <p>The following task has been marked as <strong>completed</strong> by {actor_name}:</p>
        <div style="background:#dcfce7;border-left:3px solid #10b981;padding:12px 16px;margin:12px 0;">
            <p style="margin:0 0 4px 0;font-weight:600;font-size:15px;">{task.title}</p>
            {f'<p style="margin:0;color:#555;">{task.description}</p>' if task.description else ''}
            {f'<p style="margin:8px 0 0 0;color:#374151;"><strong>Client:</strong> {task.client.company_name}</p>' if task.client else ''}
            <p style="margin:8px 0 0 0;color:#10b981;font-weight:600;">✓ Completed</p>
        </div>
    """

    extra = []
    if task.created_by_id and task.created_by_id != (actor.id if actor else None):
        extra.append(task.created_by)
    if task.owner_id and task.owner_id != (actor.id if actor else None):
        extra.append(task.owner)

    try:
        notify(
            title=title,
            message=msg,
            notification_type='task',
            link=f'/tasks',
            actor=actor,
            client=task.client,
            extra_users=extra,
        )
    except Exception as e:
        logger.warning(f'In-app completion notify failed for task {task.id}: {e}')

    # Email both creator and owner (skip the actor)
    for u in extra:
        _send_task_email(u, title, email_body, actor=actor)
