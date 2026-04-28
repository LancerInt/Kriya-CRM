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
    'pif_sent': ['factory_ready', 'cancelled'],
    'factory_ready': ['docs_preparing', 'cancelled'],
    'docs_preparing': ['inspection', 'cancelled'],
    'inspection': ['inspection_passed', 'cancelled'],
    'inspection_passed': ['container_booked', 'cancelled'],
    'container_booked': ['docs_approved', 'cancelled'],
    # 'packed' is no longer reachable from the UI; kept here for backward
    # compat in case any historical orders are stuck at that status.
    'packed': ['docs_approved', 'cancelled'],
    'docs_approved': ['dispatched', 'cancelled'],
    'dispatched': ['in_transit'],
    'in_transit': ['arrived'],
    'arrived': [],  # Terminal state
    'cancelled': [],  # Terminal state
}

# Revert map: each status can go back to its previous stage(s)
REVERT_TRANSITIONS = {
    'po_received': 'confirmed',
    'pif_sent': 'po_received',
    'factory_ready': 'pif_sent',
    'docs_preparing': 'factory_ready',
    'inspection': 'docs_preparing',
    'inspection_passed': 'inspection',
    'container_booked': 'inspection_passed',
    'packed': 'container_booked',
    'docs_approved': 'container_booked',
    'dispatched': 'docs_approved',
    'in_transit': 'dispatched',
}

# Statuses that require specific data before transition
def _all_order_items_have_pif(order):
    """True iff every OrderItem on this order has an associated PIF with a generated PDF."""
    from finance.models import PackingInstructionForm
    items = list(order.items.all())
    if not items:
        return False
    for item in items:
        pif = PackingInstructionForm.objects.filter(order_item=item).first()
        if not pif or not pif.pdf_file:
            return False
    return True


DEFAULT_READINESS_CHECKLIST = [
    {'label': 'Product', 'checked': False, 'required': True},
    {'label': 'Containers', 'checked': False, 'required': True},
    {'label': 'Cotton Box', 'checked': False, 'required': False},
    {'label': 'Leaflets', 'checked': False, 'required': False},
    {'label': 'Batch No. Stickers', 'checked': False, 'required': False},
]


def _readiness_checklist_complete(order):
    """True iff every item in the order's readiness checklist is checked."""
    checklist = order.readiness_checklist or []
    if not checklist:
        return False
    return all(bool(item.get('checked')) for item in checklist)


DOCS_APPROVED_REQUIRED_TYPES = (
    'client_invoice',
    'client_packing_list',
    'logistic_invoice',
    'logistic_packing_list',
)


def _missing_docs_for_approval(order):
    """Return the list of required doc_type values that are not yet attached."""
    from orders.models import OrderDocument
    present = set(
        OrderDocument.objects
        .filter(order=order, is_deleted=False)
        .values_list('doc_type', flat=True)
    )
    return [t for t in DOCS_APPROVED_REQUIRED_TYPES if t not in present]


def _docs_approval_ready(order):
    return len(_missing_docs_for_approval(order)) == 0


def _has_insurance_doc(order):
    from orders.models import OrderDocument
    return OrderDocument.objects.filter(order=order, doc_type='insurance', is_deleted=False).exists()


def _try_parse_date(text):
    """Best-effort parser for the user-entered estimated delivery text.
    Returns a date object or None."""
    if not text:
        return None
    try:
        from dateutil import parser as _dp
        dt = _dp.parse(str(text), dayfirst=True, fuzzy=True)
        return dt.date() if hasattr(dt, 'date') else dt
    except Exception:
        return None


def sync_shipment_from_order(order, *, bl_number=None, estimated_arrival=None,
                             dispatch_date=None, actual_arrival=None):
    """Push order-level info onto the linked Shipment record.

    Only the fields explicitly supplied are touched. After updates, transit
    days are recomputed as (actual_arrival or estimated_arrival) - dispatch_date.
    """
    from shipments.models import Shipment
    shipment = Shipment.objects.filter(order=order).order_by('-created_at').first()
    if not shipment:
        return None

    update_fields = []
    if bl_number and bl_number != (shipment.bl_number or ''):
        shipment.bl_number = bl_number
        update_fields.append('bl_number')

    if estimated_arrival is not None:
        d = _try_parse_date(estimated_arrival) if not hasattr(estimated_arrival, 'year') else estimated_arrival
        if d and shipment.estimated_arrival != d:
            shipment.estimated_arrival = d
            update_fields.append('estimated_arrival')

    if dispatch_date is not None:
        d = _try_parse_date(dispatch_date) if not hasattr(dispatch_date, 'year') else dispatch_date
        if d and shipment.dispatch_date != d:
            shipment.dispatch_date = d
            update_fields.append('dispatch_date')

    if actual_arrival is not None:
        d = _try_parse_date(actual_arrival) if not hasattr(actual_arrival, 'year') else actual_arrival
        if d and shipment.actual_arrival != d:
            shipment.actual_arrival = d
            update_fields.append('actual_arrival')

    # Recompute transit_days when we have the bracketing dates
    if shipment.dispatch_date:
        end = shipment.actual_arrival or shipment.estimated_arrival
        if end:
            try:
                days = (end - shipment.dispatch_date).days
                if days >= 0 and shipment.transit_days != days:
                    shipment.transit_days = days
                    update_fields.append('transit_days')
            except Exception:
                pass

    if update_fields:
        shipment.save(update_fields=list(set(update_fields)))
    return shipment


# Map order status -> shipment status. Only the rows that have a meaningful
# shipment-side equivalent are included; every other order status is left
# untouched so the user can still edit shipment status manually if needed.
ORDER_TO_SHIPMENT_STATUS = {
    'factory_ready': 'factory_ready',
    'inspection': 'inspection',
    'inspection_passed': 'inspection_passed',
    'container_booked': 'container_booked',
    'packed': 'packed',
    'dispatched': 'dispatched',
    'in_transit': 'in_transit',
    'arrived': 'delivered',
    'delivered': 'delivered',
}


def _sync_shipment_status(order, new_status):
    """Mirror an order's workflow status onto the linked Shipment record."""
    target = ORDER_TO_SHIPMENT_STATUS.get(new_status)
    if not target:
        return None
    from shipments.models import Shipment
    shipment = Shipment.objects.filter(order=order).order_by('-created_at').first()
    if not shipment:
        return None
    if shipment.status != target:
        shipment.status = target
        shipment.save(update_fields=['status'])
    return shipment


def _has_factory_stuffing_photo(order):
    """True iff at least one image was uploaded (as a Note attachment or
    OrderDocument) on or after the order entered Under Inspection."""
    from orders.models import OrderDocument
    if not order.inspection_at:
        return False
    qs = OrderDocument.objects.filter(
        order=order, is_deleted=False, created_at__gte=order.inspection_at,
    )
    for doc in qs:
        name = (doc.name or '').lower()
        if any(name.endswith(ext) for ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif')):
            return True
    return False


TRANSIT_REQUIRED_DOC_TYPES = ('bl', 'shipping_bill', 'schedule_list', 'coo')

# Full set of docs that must be present before the order moves from
# Documents Approved -> Dispatched. The dispatch email attaches these
# (CI, CPL, COA, MSDS, Insurance, factory-stuffing photos) and the user
# wants every document the buyer might expect to be in place before the
# shipment is sent out. Non-DG remains optional, transit docs (BL etc.)
# are checked separately at the In Transit gate.
DISPATCH_REQUIRED_DOC_TYPES = (
    'client_invoice',
    'client_packing_list',
    'logistic_invoice',
    'logistic_packing_list',
    'coa',
    'msds',
    'dbk_declaration',
    'examination_report',
    'export_declaration',
    'factory_stuffing',
    'insurance',
)


def _missing_transit_docs(order):
    from orders.models import OrderDocument
    present = set(OrderDocument.objects.filter(
        order=order, is_deleted=False, doc_type__in=TRANSIT_REQUIRED_DOC_TYPES,
    ).values_list('doc_type', flat=True))
    return [t for t in TRANSIT_REQUIRED_DOC_TYPES if t not in present]


def _has_transit_docs(order):
    return len(_missing_transit_docs(order)) == 0


PER_ITEM_DOC_TYPES = ('coa', 'msds')


def _missing_per_item_docs(order, doc_type):
    """For COA/MSDS we need one document per OrderItem. Returns a list of
    OrderItem PKs that are missing this doc_type."""
    from orders.models import OrderDocument
    items = list(order.items.all())
    if not items:
        return []
    # Order-level docs (no order_item link) count toward every item, mainly
    # for back-compat with older orders where COA/MSDS were uploaded once.
    order_level_present = OrderDocument.objects.filter(
        order=order, is_deleted=False, doc_type=doc_type, order_item__isnull=True,
    ).exists()
    if order_level_present and len(items) <= 1:
        return []
    linked_item_ids = set(OrderDocument.objects.filter(
        order=order, is_deleted=False, doc_type=doc_type, order_item__isnull=False,
    ).values_list('order_item_id', flat=True))
    return [item.id for item in items if item.id not in linked_item_ids]


def _missing_dispatch_docs(order):
    from orders.models import OrderDocument
    present = set(OrderDocument.objects.filter(
        order=order, is_deleted=False, doc_type__in=DISPATCH_REQUIRED_DOC_TYPES,
    ).values_list('doc_type', flat=True))
    missing = [t for t in DISPATCH_REQUIRED_DOC_TYPES if t not in present and t not in PER_ITEM_DOC_TYPES]
    for per_item_type in PER_ITEM_DOC_TYPES:
        if per_item_type in DISPATCH_REQUIRED_DOC_TYPES and _missing_per_item_docs(order, per_item_type):
            missing.append(per_item_type)
    return missing


def _has_all_dispatch_docs(order):
    return len(_missing_dispatch_docs(order)) == 0


def _readiness_required_complete(order):
    """True iff every REQUIRED item (Product, Bottle, etc.) in the checklist is checked.
    If the checklist is empty we treat the defaults (Product, Bottle) as not yet met."""
    checklist = order.readiness_checklist or []
    if not checklist:
        return False
    required = [it for it in checklist if it.get('required')]
    if not required:
        return True  # no required items defined — nothing to gate on
    return all(bool(it.get('checked')) for it in required)


TRANSITION_REQUIREMENTS = {
    'po_received': {
        'fields': ['po_document'],
        'message': 'PO/signed PI document must be uploaded before marking as PO Received.',
    },
    'factory_ready': {
        'check': lambda order: order.status != 'pif_sent' or _all_order_items_have_pif(order),
        'message': 'Generate a Packing Instructions Form (PIF) for every product in this order before advancing.',
    },
    'docs_preparing': {
        'check': lambda order: order.status != 'factory_ready' or _readiness_required_complete(order),
        'message': 'Tick the required readiness items (Product and Containers) before advancing to Documents Preparing.',
    },
    'inspection': {
        'check': lambda order: order.status != 'docs_preparing' or _docs_approval_ready(order),
        'message': 'Attach all required documents (Client Invoice, Client Packing List, Logistic Invoice, Logistic Packing List, COA, MSDS, DBK Declaration, Examination Report, Export Declaration Form, Factory Stuffing) before advancing.',
    },
    'container_booked': {
        'check': lambda order: order.status != 'inspection_passed' or (
            _readiness_checklist_complete(order) and _has_factory_stuffing_photo(order)
        ),
        'message': 'Tick every item in the Product Readiness checklist AND upload at least one factory-stuffing photo before advancing to Container Booked.',
    },
    'docs_approved': {
        'check': lambda order: _docs_approval_ready(order),
        'message': 'Generate the required documents (Client Invoice, Client Packing List, Logistic Invoice, Logistic Packing List) before advancing to Documents Approved.',
    },
    'dispatched': {
        'check': lambda order: _has_all_dispatch_docs(order),
        'message': 'Every required document (Client Invoice, Client Packing List, Logistic Invoice, Logistic Packing List, COA, MSDS, DBK Declaration, Examination Report, Export Declaration Form, Factory Stuffing, Insurance) must be uploaded before dispatching — the dispatch email goes out with these attachments.',
    },
    'in_transit': {
        'check': lambda order: order.status != 'dispatched' or _has_transit_docs(order),
        'message': 'Upload all four transit documents (BL, Shipping Bill, Schedule List, COO) before moving to In Transit.',
    },
}

# Statuses that trigger auto-email to client
# Statuses that trigger an automatic client email on transition.
# Most stages now build a manual AI draft on the existing thread for the user
# to review/send (Dispatched, In Transit, Delivery Acknowledgment) — no
# templated auto-emails. Only 'arrived' still fires a confirmation by default.
AUTO_EMAIL_STATUSES = ['arrived']

# Status timestamp field mapping
STATUS_TIMESTAMP_MAP = {
    'confirmed': 'confirmed_at',
    'po_received': 'po_received_at',
    'pif_sent': 'pif_sent_at',
    'docs_preparing': 'docs_preparing_at',
    'factory_ready': 'factory_ready_at',
    'inspection': 'inspection_at',
    'inspection_passed': 'inspection_passed_at',
    'container_booked': 'container_booked_at',
    'packed': 'container_booked_at',  # reuse container_booked timestamp for packed
    'docs_approved': 'docs_approved_at',
    'dispatched': 'dispatched_at',
    'in_transit': 'in_transit_at',
    'arrived': 'arrived_at',
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

    # Reset CRO reminder clock whenever we enter Container Booked
    if new_status == 'container_booked':
        order.last_cro_reminder_at = None

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

    # 8. Auto-create purchase history when order arrives
    if new_status == 'arrived':
        _auto_create_purchase_history(order)

    # 9. Auto-create the Shipment record on PO Received (idempotent)
    if new_status == 'po_received':
        _auto_create_shipment(order, user)

    # 10. Keep the linked Shipment dates in sync with the order workflow
    try:
        from datetime import date as _date
        if new_status == 'dispatched':
            sync_shipment_from_order(order, dispatch_date=_date.today())
        elif new_status == 'arrived':
            sync_shipment_from_order(order, actual_arrival=_date.today())
    except Exception as _e:
        logger.warning(f'Failed to sync Shipment dates for {order.order_number}: {_e}')

    # 11. Mirror the order's workflow status onto the linked Shipment so the
    # Shipments page reflects Dispatched / In Transit / Delivered automatically.
    try:
        _sync_shipment_status(order, new_status)
    except Exception as _e:
        logger.warning(f'Failed to sync Shipment status for {order.order_number}: {_e}')

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


def revert_order(order, user, remarks=''):
    """
    Revert order to its previous stage.
    Only admin/manager can revert. Clears the timestamp for the reverted stage.
    """
    from orders.models import OrderStatusHistory, WorkflowEventLog

    if user.role not in ('admin', 'manager'):
        raise WorkflowError('Only admin or manager can revert order status.')

    previous = REVERT_TRANSITIONS.get(order.status)
    if not previous:
        raise WorkflowError(f'Cannot revert from "{get_status_display(order.status)}". No previous stage.')

    old_status = order.status

    # Clear timestamp for the current status
    ts_field = STATUS_TIMESTAMP_MAP.get(old_status)
    if ts_field and hasattr(order, ts_field):
        setattr(order, ts_field, None)

    order.status = previous

    # Clear documents related to the reverted stage
    if old_status == 'po_received' or previous == 'confirmed':
        order.po_document = None
        order.po_number = ''

    order.save()

    # Remove documents uploaded for the reverted stage
    from orders.models import OrderDocument
    # Map: which doc types belong to which stage
    stage_doc_types = {
        'po_received': ['po'],
        'pif_sent': ['pif'],
        'docs_preparing': [],
        'docs_approved': [],
    }
    # Delete docs for the old (reverted) stage
    doc_types_to_remove = stage_doc_types.get(old_status, [])
    if doc_types_to_remove:
        OrderDocument.objects.filter(order=order, doc_type__in=doc_types_to_remove).delete()
        logger.info(f'Cleaned up {doc_types_to_remove} documents for reverted stage {old_status}')

    # Log
    OrderStatusHistory.objects.create(
        order=order, from_status=old_status, to_status=previous,
        changed_by=user, remarks=remarks or f'Reverted from {get_status_display(old_status)}',
    )
    WorkflowEventLog.objects.create(
        order=order, event_type='status_change',
        description=f'Reverted from {get_status_display(old_status)} to {get_status_display(previous)}',
        metadata={'from': old_status, 'to': previous, 'remarks': remarks, 'reverted': True},
        triggered_by=user,
    )

    logger.info(f'Order {order.order_number}: REVERTED {old_status} → {previous} by {user.username}')
    return order


def get_order_timeline(order):
    """Return the full timeline of an order (status changes + events)."""
    from orders.models import Order

    all_statuses = [
        'confirmed', 'po_received', 'pif_sent',
        'factory_ready', 'docs_preparing', 'inspection', 'inspection_passed',
        'container_booked', 'docs_approved',
        'dispatched', 'in_transit', 'arrived',
    ]

    status_idx = all_statuses.index(order.status) if order.status in all_statuses else -1

    timeline = []
    for i, s in enumerate(all_statuses):
        ts_field = STATUS_TIMESTAMP_MAP.get(s)
        timestamp = getattr(order, ts_field) if ts_field else None

        # `arrived` is the terminal Delivered step — mark it completed
        # once reached so the timeline shows a green checkmark and the next
        # focus shifts to Feedback / FIRC.
        if s == 'arrived':
            state = 'completed' if status_idx >= i else 'upcoming'
        else:
            state = 'completed' if i < status_idx else 'current' if i == status_idx else 'upcoming'

        timeline.append({
            'status': s,
            'label': get_status_display(s),
            'state': state,
            'timestamp': timestamp.isoformat() if timestamp else None,
        })

    has_feedback = False
    try:
        has_feedback = order.feedback is not None
    except Exception:
        has_feedback = False

    has_firc = bool(getattr(order, 'firc_received_at', None))

    # Feedback step — completed when feedback is recorded; current when the
    # order has reached arrived but feedback is still pending.
    if has_feedback:
        feedback_state = 'completed'
    elif order.status == 'arrived':
        feedback_state = 'current'
    else:
        feedback_state = 'upcoming'
    timeline.append({
        'status': 'feedback',
        'label': 'Feedback',
        'state': feedback_state,
        'timestamp': order.feedback.created_at.isoformat() if has_feedback else None,
    })

    # FIRC — 11th and final step. Current when feedback is in (or order
    # arrived) but FIRC is still pending; completed once firc_received_at is set.
    if has_firc:
        firc_state = 'completed'
    elif has_feedback:
        firc_state = 'current'
    else:
        firc_state = 'upcoming'
    timeline.append({
        'status': 'firc',
        'label': 'FIRC',
        'state': firc_state,
        'timestamp': order.firc_received_at.isoformat() if has_firc and order.firc_received_at else None,
    })

    return timeline


def _auto_create_shipment(order, user):
    """Auto-create a Shipment record when an order moves to PO Received.

    Idempotent — bails if a shipment already exists for this order. Pulls
    shipping-relevant defaults from the order itself so the user has
    something to start editing.
    """
    try:
        from shipments.models import Shipment
        if Shipment.objects.filter(order=order).exists():
            return None

        # Generate the next shipment number (zero-padded auto-increment),
        # mirroring the pattern used by the Shipment serializer/viewset.
        count = Shipment.objects.count() + 1
        shipment_number = f'SHP-{count:05d}'
        # Defensive: walk forward until unique in case of races / gaps.
        while Shipment.objects.filter(shipment_number=shipment_number).exists():
            count += 1
            shipment_number = f'SHP-{count:05d}'

        # Shipping fields the quotation/order may already carry — pulled here
        # so the user doesn't have to retype them on the shipment form.
        port_of_loading = ''
        port_of_discharge = ''
        if order.quotation_id:
            try:
                q = order.quotation
                port_of_loading = getattr(q, 'port_of_loading', '') or ''
                port_of_discharge = getattr(q, 'port_of_discharge', '') or ''
            except Exception:
                pass

        Shipment.objects.create(
            shipment_number=shipment_number,
            order=order,
            client=order.client,
            status='pending',
            delivery_terms=order.delivery_terms or '',
            freight_type=order.freight_terms or '',
            port_of_loading=port_of_loading,
            port_of_discharge=port_of_discharge,
            country=getattr(order.client, 'country', '') or '',
        )
        logger.info(f'Auto-created shipment {shipment_number} for order {order.order_number}')
    except Exception as e:
        logger.exception(f'Failed to auto-create shipment for order {order.order_number}: {e}')


def _auto_create_purchase_history(order):
    """Auto-create purchase history entries from delivered order items."""
    from clients.models import PurchaseHistory

    for item in order.items.all():
        # Skip if already recorded for this order + product
        exists = PurchaseHistory.objects.filter(
            client=order.client, order=order,
            product_name=item.product_name, is_deleted=False,
        ).exists()
        if exists:
            continue

        PurchaseHistory.objects.create(
            client=order.client,
            order=order,
            product=item.product,
            product_name=item.product_name,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            total_price=item.total_price,
            currency=order.currency,
            purchase_date=timezone.now().date(),
            invoice_number=order.order_number,
            status='completed',
        )

    # Also auto-update price list with latest prices
    _auto_update_price_list(order)


def _auto_update_price_list(order):
    """Auto-create/update client price list from order items."""
    from clients.models import ClientPriceList

    for item in order.items.all():
        existing = ClientPriceList.objects.filter(
            client=order.client,
            product_name=item.product_name,
            is_deleted=False,
        ).first()

        if existing:
            # Update price if changed
            if existing.unit_price != item.unit_price:
                existing.unit_price = item.unit_price
                existing.currency = order.currency
                existing.save(update_fields=['unit_price', 'currency', 'updated_at'])
        else:
            ClientPriceList.objects.create(
                client=order.client,
                product=item.product,
                product_name=item.product_name,
                client_product_name=item.client_product_name or '',
                unit_price=item.unit_price,
                currency=order.currency,
                unit=item.unit,
            )
