"""
Central notification helper — ensures admin/manager get ALL notifications
and executives get only their relevant updates.
"""
import logging
from .models import Notification

logger = logging.getLogger(__name__)


def notify(title, message='', notification_type='system', link='',
           actor=None, client=None, extra_users=None):
    """
    Send notifications to the right people.

    Rules:
    - Admin & Manager: always notified (for every action)
    - Executive: only notified if the action relates to their client
    - Actor (person who performed the action): never notified about their own action

    Args:
        title: Short notification title
        message: Longer description (optional)
        notification_type: task | approval | alert | reminder | system
        link: Frontend path to navigate to (e.g. '/clients/uuid')
        actor: The User who performed the action (will be excluded)
        client: The Client object (used to determine which executive to notify)
        extra_users: Additional User objects/IDs to notify (e.g. task owner)
    """
    from accounts.models import User

    actor_id = actor.id if actor else None
    recipients = set()

    # 1. Always notify all admin and manager users
    admin_mgr = User.objects.filter(
        is_active=True, role__in=['admin', 'manager']
    ).values_list('id', flat=True)
    recipients.update(admin_mgr)

    # 2. Notify executives related to this client
    if client:
        if hasattr(client, 'primary_executive') and client.primary_executive_id:
            recipients.add(client.primary_executive_id)
        if hasattr(client, 'shadow_executive') and client.shadow_executive_id:
            recipients.add(client.shadow_executive_id)
        # Also check ClientAssignment
        try:
            from clients.models import ClientAssignment
            assigned = ClientAssignment.objects.filter(
                client=client
            ).values_list('user_id', flat=True)
            recipients.update(assigned)
        except Exception:
            pass

    # 3. Add any extra users
    if extra_users:
        for u in extra_users:
            uid = u.id if hasattr(u, 'id') else u
            if uid:
                recipients.add(uid)

    # 4. Remove actor — don't notify yourself
    if actor_id:
        recipients.discard(actor_id)

    # 5. Bulk create notifications
    if not recipients:
        return

    notifications = [
        Notification(
            user_id=uid,
            notification_type=notification_type,
            title=title,
            message=message,
            link=link,
        )
        for uid in recipients
    ]
    Notification.objects.bulk_create(notifications)
    logger.debug(f'Sent {len(notifications)} notifications: {title}')
