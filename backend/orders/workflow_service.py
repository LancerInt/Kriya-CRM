"""
Order Workflow State Machine — controls ALL status transitions.

Rules:
1. Only valid transitions are allowed (no skipping)
2. Some transitions require data (e.g., PO_RECEIVED needs PO upload)
3. Every transition is logged in OrderStatusHistory
4. Side effects (emails, notifications) are triggered automatically
5. Timestamps are set on the Order model
"""
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)

# ── State Machine Definition ──
# Maps: current_status → list of allowed next statuses
ALLOWED_TRANSITIONS = {
    'confirmed': ['po_received', 'cancelled'],
    'po_received': ['pif_sent', 'cancelled'],
    'pif_sent': ['docs_preparing', 'cancelled'],
    'docs_preparing': ['docs_approved', 'cancelled'],
    'docs_approved': ['factory_ready', 'cancelled'],
    'factory_ready': ['container_booked', 'cancelled'],
    'container_booked': ['inspection', 'packed', 'cancelled'],
    'inspection': ['inspection_passed', 'cancelled'],
    'inspection_passed': ['dispatched', 'cancelled'],
    'dispatched': ['in_transit'],
    'in_transit': ['arrived'],
    'arrived': ['customs'],
    'customs': ['delivered'],
    'delivered': [],  # Terminal state
    'cancelled': [],  # Terminal state
}

# Statuses that require specific data before transition
TRANSITION_REQUIREMENTS = {
    'po_received': {
        'fields': ['po_document'],
        'message': 'PO/signed PI document must be uploaded before marking as PO Received.',
    },
    'container_booked': {
        'fields': [],
        'message': '',
    },
    'dispatched': {
        'check': lambda order: order.status == 'inspection_passed',
        'message': 'Inspection must pass before dispatching.',
    },
}

# Statuses that trigger auto-email to client
AUTO_EMAIL_STATUSES = ['inspection_passed', 'dispatched', 'in_transit', 'delivered']

# Status timestamp field mapping
STATUS_TIMESTAMP_MAP = {
    'confirmed': 'confirmed_at',
    'po_received': 'po_received_at',
    'pif_sent': 'pif_sent_at',
    'docs_approved': 'docs_approved_at',
    'factory_ready': 'factory_ready_at',
    'container_booked': 'container_booked_at',
    'inspection_passed': 'inspection_passed_at',
    'dispatched': 'dispatched_at',
    'delivered': 'delivered_at',
}


class WorkflowError(Exception):
    """Raised when a workflow transition is invalid."""
    pass


def get_allowed_transitions(order):
    """Return list of allowed next statuses for the current order."""
    return ALLOWED_TRANSITIONS.get(order.status, [])


def get_status_display(status_code):
    """Return human-readable status."""
    from orders.models import Order
    for code, label in Order.Status.choices:
        if code == status_code:
            return label
    return status_code


def validate_transition(order, new_status):
    """Validate if the transition is allowed. Raises WorkflowError if not."""
    allowed = get_allowed_transitions(order)

    if new_status not in allowed:
        current_display = get_status_display(order.status)
        new_display = get_status_display(new_status)
        allowed_display = [get_status_display(s) for s in allowed]
        raise WorkflowError(
            f'Cannot move from "{current_display}" to "{new_display}". '
            f'Allowed transitions: {", ".join(allowed_display) if allowed_display else "None (terminal state)"}.'
        )

    # Check requirements
    req = TRANSITION_REQUIREMENTS.get(new_status)
    if req:
        for field in req.get('fields', []):
            if not getattr(order, field, None):
                raise WorkflowError(req['message'])
        check_fn = req.get('check')
        if check_fn and not check_fn(order):
            raise WorkflowError(req['message'])

    return True


def transition_order(order, new_status, user, remarks=''):
    """
    Execute a status transition on an order.
    - Validates the transition
    - Updates the status
    - Sets timestamp
    - Creates audit log
    - Triggers side effects (notifications, emails)
    Returns the updated order.
    """
    from orders.models import OrderStatusHistory, WorkflowEventLog

    # 1. Validate
    validate_transition(order, new_status)

    old_status = order.status
    now = timezone.now()

    # 2. Update status
    order.status = new_status

    # 3. Set timestamp
    ts_field = STATUS_TIMESTAMP_MAP.get(new_status)
    if ts_field:
        setattr(order, ts_field, now)

    order.save()

    # 4. Log status change
    OrderStatusHistory.objects.create(
        order=order,
        from_status=old_status,
        to_status=new_status,
        changed_by=user,
        remarks=remarks,
    )

    # 5. Log workflow event
    WorkflowEventLog.objects.create(
        order=order,
        event_type='status_change',
        description=f'Status changed from {get_status_display(old_status)} to {get_status_display(new_status)}',
        metadata={'from': old_status, 'to': new_status, 'remarks': remarks},
        triggered_by=user,
    )

    # 6. Trigger notifications
    _notify_status_change(order, old_status, new_status, user)

    # 7. Trigger auto-email to client
    if new_status in AUTO_EMAIL_STATUSES:
        _send_client_status_email(order, new_status, user)

    logger.info(f'Order {order.order_number}: {old_status} → {new_status} by {user.username}')
    return order


def _notify_status_change(order, old_status, new_status, user):
    """Send internal notifications on status change."""
    from notifications.models import Notification

    title = f'{order.order_number}: {get_status_display(new_status)}'
    message = f'Order {order.order_number} ({order.client.company_name}) moved to "{get_status_display(new_status)}".'

    # Notify order creator
    if order.created_by and order.created_by != user:
        Notification.objects.create(
            user=order.created_by, notification_type='system',
            title=title, message=message, link=f'/orders/{order.id}',
        )

    # Notify primary executive
    pe = order.client.primary_executive
    if pe and pe != user and pe != order.created_by:
        Notification.objects.create(
            user=pe, notification_type='system',
            title=title, message=message, link=f'/orders/{order.id}',
        )


def _send_client_status_email(order, new_status, user):
    """Send status update email to client's primary contact."""
    from orders.email_service import send_order_status_email
    try:
        send_order_status_email(order, new_status)
    except Exception as e:
        logger.error(f'Failed to send status email for {order.order_number}: {e}')


def get_order_timeline(order):
    """Return the full timeline of an order (status changes + events)."""
    from orders.models import Order

    all_statuses = [
        'confirmed', 'po_received', 'pif_sent', 'docs_preparing', 'docs_approved',
        'factory_ready', 'container_booked', 'inspection', 'inspection_passed',
        'dispatched', 'in_transit', 'arrived', 'customs', 'delivered',
    ]

    status_idx = all_statuses.index(order.status) if order.status in all_statuses else -1

    timeline = []
    for i, s in enumerate(all_statuses):
        ts_field = STATUS_TIMESTAMP_MAP.get(s)
        timestamp = getattr(order, ts_field) if ts_field else None

        timeline.append({
            'status': s,
            'label': get_status_display(s),
            'state': 'completed' if i < status_idx else 'current' if i == status_idx else 'upcoming',
            'timestamp': timestamp.isoformat() if timestamp else None,
        })

    return timeline
