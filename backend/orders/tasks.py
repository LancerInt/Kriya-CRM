"""
Celery periodic tasks for the orders app.
"""
import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name='orders.check_cro_reminders')
def check_cro_reminders():
    """
    Nudge users every 2 hours to upload the CRO document once an order enters
    the Container Booked stage. Stops nudging as soon as a CRO is attached.

    Scheduled to run frequently (every 30 min); the 2h cool-down is enforced
    per-order via `Order.last_cro_reminder_at`.
    """
    from orders.models import Order, OrderDocument
    from notifications.helpers import notify

    now = timezone.now()
    threshold = now - timedelta(hours=2)

    qs = Order.objects.filter(status='container_booked', is_deleted=False).select_related('client')
    sent = 0

    for order in qs:
        # Skip if CRO already uploaded
        if OrderDocument.objects.filter(order=order, doc_type='cro', is_deleted=False).exists():
            continue

        # Respect the 2h cool-down
        if order.last_cro_reminder_at and order.last_cro_reminder_at > threshold:
            continue

        # Don't start nudging until container_booked_at is at least 2h old —
        # first reminder fires 2 hours after the stage change.
        if order.container_booked_at and order.container_booked_at > threshold:
            continue

        notify(
            title=f'CRO pending for {order.order_number}',
            message=(
                f'Order {order.order_number} ({order.client.company_name}) has been at '
                f'Container Booked for at least 2 hours and the Container Release Order (CRO) '
                f'document is still not attached. Please upload it to the Documents Checklist.'
            ),
            notification_type='reminder',
            link=f'/orders/{order.id}',
            client=order.client,
        )

        order.last_cro_reminder_at = now
        order.save(update_fields=['last_cro_reminder_at'])
        sent += 1

    logger.info(f'CRO reminder task: sent {sent} notifications')
    return {'sent': sent}


@shared_task(name='orders.check_transit_doc_reminders')
def check_transit_doc_reminders():
    """
    Nudge users every 2 hours to upload the transit documents (BL, Shipping
    Bill, Schedule List, COO) once an order is at Dispatched. Stops as soon
    as all four are attached.

    The 2h cool-down is enforced per-order via
    ``Order.last_transit_reminder_at``. Scheduled to run every 30 min by
    Celery Beat (see config/celery.py); also piggybacked on the unread-count
    poll in notifications/views.py for environments running without Beat.
    """
    from orders.models import Order, OrderDocument
    from notifications.helpers import notify

    REQUIRED = {
        'bl': 'BL (Bill of Lading)',
        'shipping_bill': 'Shipping Bill',
        'schedule_list': 'Schedule List',
        'coo': 'COO (Certificate of Origin)',
    }

    now = timezone.now()
    threshold = now - timedelta(hours=2)

    qs = Order.objects.filter(status='dispatched', is_deleted=False).select_related('client')
    sent = 0

    for order in qs:
        present = set(
            OrderDocument.objects
            .filter(order=order, is_deleted=False, doc_type__in=REQUIRED.keys())
            .values_list('doc_type', flat=True)
        )
        missing = [REQUIRED[k] for k in REQUIRED if k not in present]
        if not missing:
            continue

        # Respect the 2h cool-down
        if order.last_transit_reminder_at and order.last_transit_reminder_at > threshold:
            continue
        # Don't fire until at least 2 hours have passed since the order was
        # dispatched.
        if order.dispatched_at and order.dispatched_at > threshold:
            continue

        notify(
            title=f'Transit docs pending for {order.order_number}',
            message=(
                f'Order {order.order_number} ({order.client.company_name}) has been at '
                f'Dispatched for at least 2 hours and the following transit document(s) '
                f'are still not attached: {", ".join(missing)}. Please upload them so the '
                f'order can advance to In Transit.'
            ),
            notification_type='reminder',
            link=f'/orders/{order.id}',
            client=order.client,
        )

        order.last_transit_reminder_at = now
        order.save(update_fields=['last_transit_reminder_at'])
        sent += 1

    logger.info(f'Transit-doc reminder task: sent {sent} notifications')
    return {'sent': sent}


# ─────────── Delivery acknowledgment reminder ───────────
# TESTING MODE: trigger 3 minutes after the order enters In Transit.
# PRODUCTION MODE: trigger 3 days before the estimated delivery date.
# Switch by changing DELIVERY_REMINDER_MODE below.
DELIVERY_REMINDER_MODE = 'production'
DELIVERY_REMINDER_TEST_OFFSET_MINUTES = 3
DELIVERY_REMINDER_PROD_LEAD_DAYS = 3
# Fallback when the user-entered estimated delivery text is not parseable
# (e.g. "25-30 days from dispatch"). Fires this many days after in_transit_at.
DELIVERY_REMINDER_FALLBACK_DAYS_AFTER_TRANSIT = 21


def _parse_estimated_delivery(order):
    """Find the estimated-delivery note saved by the dispatch flow and
    attempt to parse its text into a date. Returns datetime or None."""
    try:
        from orders.models import WorkflowEventLog
        ev = (
            WorkflowEventLog.objects
            .filter(order=order, event_type='note', metadata__kind='estimated_delivery')
            .order_by('-created_at')
            .first()
        )
        if not ev:
            return None
        raw = (ev.metadata or {}).get('value') or ''
        if not raw:
            return None
        # dateutil parses many formats: "15 May 2026", "15/05/2026", "2026-05-15"
        try:
            from dateutil import parser as _dp
            return _dp.parse(raw, dayfirst=True, fuzzy=True)
        except Exception:
            return None
    except Exception:
        return None


def _build_delivery_reminder_draft(order, actor):
    """Create / refresh an EmailDraft on the order's email thread asking the
    client to acknowledge once goods are received. Returns (draft, comm)."""
    from communications.models import Communication, EmailDraft, DraftAttachment
    from finance.models import ProformaInvoice
    from django.db.models import Q

    # Resolve the same email thread as dispatch / transit
    comm = None
    pi_with_src = ProformaInvoice.objects.filter(
        order=order, source_communication__isnull=False,
    ).order_by('-created_at').first()
    if pi_with_src and pi_with_src.source_communication_id:
        comm = Communication.objects.filter(id=pi_with_src.source_communication_id, is_deleted=False).first()
    if not comm:
        product_names = [it.product_name for it in order.items.all() if it.product_name]
        if product_names:
            product_q = Q()
            for name in product_names:
                product_q |= Q(subject__icontains=name) | Q(body__icontains=name)
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', direction='inbound', is_deleted=False,
            ).filter(product_q).order_by('-created_at').first()
    if not comm and order.order_number:
        comm = Communication.objects.filter(
            client=order.client, comm_type='email', is_deleted=False,
        ).filter(Q(subject__icontains=order.order_number) | Q(body__icontains=order.order_number)).order_by('-created_at').first()
    if not comm:
        comm = Communication.objects.filter(
            client=order.client, comm_type='email', direction='inbound', is_deleted=False,
        ).order_by('-created_at').first()
    if not comm:
        comm = Communication.objects.filter(
            client=order.client, comm_type='email', is_deleted=False,
        ).order_by('-created_at').first()

    client_name = order.client.company_name if order.client else 'Valued Customer'
    product_lines = ', '.join([(it.product_name or '') for it in order.items.all() if it.product_name])
    ai_subject = f'Re: {comm.subject}' if comm and comm.subject else 'Delivery Acknowledgment'
    ai_body = (
        f'<p>Dear {client_name},</p>'
        f'<p>We hope this message finds you well.</p>'
        f'<p>This is to inform you that your shipment'
        f'{f" containing <strong>{product_lines}</strong>" if product_lines else ""} '
        f'is expected to reach you within the next <strong>3–4 days</strong>.</p>'
        f'<p>Kindly acknowledge receipt once the consignment arrives, and confirm '
        f'that the products have reached you in good shape and condition. Should you '
        f'notice any discrepancy or damage, please let us know at the earliest so we '
        f'may assist promptly.</p>'
        f'<p>We sincerely appreciate your continued trust and look forward to your confirmation.</p>'
        f'<p>Best regards,<br/>{getattr(actor, "full_name", "") or actor.username}</p>'
    )

    to_email = ''
    if comm and getattr(comm, 'external_email', ''):
        to_email = comm.external_email
    if not to_email:
        from clients.models import Contact
        primary = Contact.objects.filter(client=order.client, is_primary=True).first() \
            or Contact.objects.filter(client=order.client).first()
        if primary and primary.email:
            to_email = primary.email

    if comm:
        draft = EmailDraft.objects.filter(communication=comm, status='draft').order_by('-updated_at').first()
    else:
        draft = None
    if not draft:
        draft = EmailDraft.objects.create(
            communication=comm,
            to_email=to_email or '',
            subject=ai_subject,
            body=ai_body,
            cc='', status='draft',
            created_by=actor, edited_by=actor,
        )
    else:
        update_fields = ['edited_by']
        if not (draft.to_email or '').strip() and to_email:
            draft.to_email = to_email; update_fields.append('to_email')
        if not (draft.subject or '').strip():
            draft.subject = ai_subject; update_fields.append('subject')
        draft.body = ai_body; update_fields.append('body')
        draft.edited_by = actor
        draft.save(update_fields=update_fields)

    return draft, comm


@shared_task(name='orders.check_delivery_reminders')
def check_delivery_reminders():
    """Build a delivery-acknowledgment email draft and notify users when an
    in-transit order is approaching delivery.

    TESTING MODE: 3 minutes after `in_transit_at`.
    PRODUCTION MODE: 3 days before the estimated delivery date.
    """
    from accounts.models import User
    from orders.models import Order
    from notifications.helpers import notify

    now = timezone.now()
    qs = Order.objects.filter(
        status='in_transit', is_deleted=False,
        delivery_reminder_sent_at__isnull=True,
    ).select_related('client')

    sent = 0
    for order in qs:
        # Determine whether this order is due for a reminder right now
        due = False
        if DELIVERY_REMINDER_MODE == 'testing':
            if order.in_transit_at and (now - order.in_transit_at) >= timedelta(minutes=DELIVERY_REMINDER_TEST_OFFSET_MINUTES):
                due = True
        else:  # production: 3 days before estimated delivery
            est_dt = _parse_estimated_delivery(order)
            if est_dt is not None:
                # Fire when current time is within 3 days of the estimated delivery.
                # Make est_dt timezone-aware to compare cleanly with `now`.
                if est_dt.tzinfo is None:
                    from django.utils import timezone as _tz
                    est_dt = _tz.make_aware(est_dt, _tz.get_current_timezone())
                if (est_dt - now) <= timedelta(days=DELIVERY_REMINDER_PROD_LEAD_DAYS):
                    due = True
            else:
                # No parseable estimated delivery — fall back to a fixed
                # offset from in_transit_at so the reminder still fires.
                if order.in_transit_at and (now - order.in_transit_at) >= timedelta(days=DELIVERY_REMINDER_FALLBACK_DAYS_AFTER_TRANSIT):
                    due = True
        if not due:
            continue

        # Pick an actor for the draft (the order creator if available, else first admin)
        actor = order.created_by or User.objects.filter(is_active=True, role='admin').first()
        if not actor:
            continue

        try:
            draft, comm = _build_delivery_reminder_draft(order, actor)
        except Exception as e:
            logger.exception(f'Failed to build delivery-reminder draft for {order.order_number}: {e}')
            continue

        link = f'/communications/{comm.id}' if comm else '/communications'
        notify(
            title=f'Delivery acknowledgment draft ready — {order.order_number}',
            message=(
                f'Order {order.order_number} ({order.client.company_name}) is approaching delivery. '
                f'A delivery-acknowledgment email draft has been prepared on the existing thread. '
                f'Click to review and send.'
            ),
            notification_type='reminder',
            link=link,
            client=order.client,
        )

        order.delivery_reminder_sent_at = now
        order.save(update_fields=['delivery_reminder_sent_at'])
        sent += 1

    logger.info(f'Delivery reminder task: prepared {sent} drafts')
    return {'sent': sent}


@shared_task(name='orders.check_balance_payment_reminders')
def check_balance_payment_reminders():
    """
    Fire a reminder 10 days before the balance payment is due (e.g.
    "D/A 60 days" balance due 50 days after dispatch). The reminder
    targets the assigned executive + admin/manager via notify(); per-order
    cool-down is enforced through `balance_reminder_sent_at`.

    Scheduled daily (early morning IST). Skips orders that:
      - have no payment terms with a balance
      - haven't dispatched yet
      - already received the balance
      - already had a reminder fired
    """
    from datetime import date
    from orders.models import Order
    from orders.payment_terms import (
        compute_balance_due_date, compute_advance_due_date, parse_payment_terms,
    )
    from notifications.helpers import notify

    today = date.today()
    qs = (
        Order.objects.filter(is_deleted=False)
        .exclude(dispatched_at__isnull=True)
        .select_related('client')
    )
    sent = 0

    for order in qs:
        # Reuse one shared reminder slot (`balance_reminder_sent_at`) for
        # whichever row is After Dispatch. Either row, but not both, will
        # have a due date at any given time for a typical export deal.
        if order.balance_reminder_sent_at:
            continue

        parsed = parse_payment_terms(order.payment_terms)
        candidates = []
        # Balance row when it's After Dispatch and unpaid
        if parsed['has_balance'] and not order.balance_is_before_dispatch and not order.balance_payment_received_at:
            due = compute_balance_due_date(order)
            if due:
                candidates.append(('Balance', parsed['balance_pct'], due))
        # Advance row when it's After Dispatch and unpaid
        if parsed['has_advance'] and not order.advance_is_before_dispatch and not order.advance_payment_received_at:
            due = compute_advance_due_date(order)
            if due:
                candidates.append(('Advance', parsed['advance_pct'], due))

        if not candidates:
            continue

        # Fire on the earliest still-pending payment first.
        candidates.sort(key=lambda c: c[2])
        label, pct, due = candidates[0]
        days_until_due = (due - today).days
        if days_until_due > 10:
            continue

        client_name = order.client.company_name if order.client else 'Unknown client'
        title = (
            f'{label} payment ({pct}%) due in {days_until_due} day(s): {order.order_number}'
            if days_until_due >= 0
            else f'{label} payment ({pct}%) overdue ({-days_until_due} day(s)): {order.order_number}'
        )
        notify(
            title=title,
            message=(
                f'Order {order.order_number} for {client_name} has a {label.lower()} '
                f'payment due on {due.isoformat()} (terms: "{order.payment_terms}"). '
                f'Confirm with the client and mark it received.'
            ),
            notification_type='reminder',
            link=f'/orders/{order.id}',
            client=order.client,
            extra_users=[order.created_by] if order.created_by else None,
        )
        order.balance_reminder_sent_at = timezone.now()
        order.save(update_fields=['balance_reminder_sent_at'])
        sent += 1

    logger.info(f'Payment reminder task: fired {sent} reminders')
    return {'sent': sent}
