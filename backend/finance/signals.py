"""
Two responsibilities here:

1. CommercialInvoice -> Order + Payment + OrderItems sync.
2. Order.firc_received_at / Sample.firc_received_at -> FIRCRecord rows
   so the Finance > FIRC tab lists every confirmed FIRC.

On every CommercialInvoice save, propagate the CI's authoritative values
back to the source Order and the Finance > Payments list:

  1. terms_of_trade    -> order.payment_terms   (drives Payment Tracking card)
  2. total_invoice_usd -> order.total           (so the order header shows the
                                                 right amount once items are
                                                 entered in the CI)
  3. total             -> Payment row           (ensures the Payments tab
                                                 shows the latest amount)

Wired via post_save so every path — create_from_order, save-with-items,
ModelViewSet PATCH, shell .save() — keeps the data in sync.
"""
import logging
from datetime import date
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import CommercialInvoice, Payment

logger = logging.getLogger(__name__)


@receiver(post_save, sender=CommercialInvoice)
def sync_ci_to_order_and_payment(sender, instance, created, **kwargs):
    if not instance.order_id:
        return
    try:
        order = instance.order
    except Exception as e:
        logger.warning(f'CI {instance.id} order lookup failed: {e}')
        return

    # ── 1. terms_of_trade -> order.payment_terms ──────────────────────────
    incoming_terms = (instance.terms_of_trade or instance.payment_terms or '').strip()
    if incoming_terms and (order.payment_terms or '').strip() != incoming_terms:
        order.payment_terms = incoming_terms
        order.save(update_fields=['payment_terms'])

    # ── 1b. CI items -> Order items ───────────────────────────────────────
    # Mirror the CI's Packing Details onto the Order's Line Items so the
    # order detail page shows the same Product / Qty / Total / Grand Total
    # that's printed on the CI. Matched by POSITION (index) since the user
    # may rename a row on either side. We update existing OrderItem rows
    # in-place — preserving their PK and any FKs to OrderDocument / PIF.
    # If the CI has more rows than the Order, extras are appended; if the
    # Order has more rows than the CI, the trailing rows are deleted
    # (OrderDocument's FK is SET_NULL; PIF cascades, which is acceptable
    # because removing a product means its PIF is no longer relevant).
    try:
        from orders.models import OrderItem
        from decimal import Decimal
        ci_items = list(instance.items.all())
        order_items = list(order.items.order_by('id').all())
        if ci_items:
            for idx, ci_item in enumerate(ci_items):
                qty = Decimal(ci_item.quantity or 0)
                unit_price = Decimal(ci_item.unit_price or 0)
                if idx < len(order_items):
                    oi = order_items[idx]
                    # Preserve the Order's product_name and client_product_name —
                    # those reflect what the client asked for in the original
                    # email. Only the numeric fields are pulled from the CI.
                    changed = False
                    if Decimal(oi.quantity or 0) != qty:
                        oi.quantity = qty
                        changed = True
                    if (oi.unit or '') != (ci_item.unit or oi.unit):
                        oi.unit = ci_item.unit or oi.unit
                        changed = True
                    if Decimal(oi.unit_price or 0) != unit_price:
                        oi.unit_price = unit_price
                        changed = True
                    if changed:
                        oi.save()  # recomputes total_price = qty * unit_price
                else:
                    # CI has more rows than the Order — append using the
                    # CI's product_name as a sensible fallback, since the
                    # email never anchored a name for this slot.
                    OrderItem.objects.create(
                        order=order,
                        product_name=ci_item.product_name,
                        client_product_name=ci_item.client_product_name or '',
                        quantity=qty,
                        unit=ci_item.unit or 'KG',
                        unit_price=unit_price,
                    )
            # Trim trailing OrderItems that aren't in the CI anymore.
            for extra in order_items[len(ci_items):]:
                extra.delete()
    except Exception as e:
        logger.warning(f'OrderItem sync failed for CI {instance.id}: {e}')

    # ── 2. CI total -> order.total ────────────────────────────────────────
    ci_total = instance.total_invoice_usd or instance.grand_total_inr or 0
    try:
        ci_total_d = float(ci_total or 0)
    except (TypeError, ValueError):
        ci_total_d = 0
    if ci_total_d and float(order.total or 0) != ci_total_d:
        order.total = ci_total_d
        order.save(update_fields=['total'])

    # ── 3. Maintain the Payments row ──────────────────────────────────────
    # Auto-managed by reference "CI <invoice_number>" — the Payments tab
    # uses this to surface the linked Order. Idempotent: update if exists,
    # create if missing.
    if not ci_total_d:
        return
    ref = f'CI {instance.invoice_number}'
    try:
        payment, was_created = Payment.objects.get_or_create(
            reference=ref,
            defaults={
                'invoice': None,
                'client': instance.client,
                'amount': ci_total_d,
                'currency': instance.currency or 'USD',
                'payment_date': instance.invoice_date or date.today(),
                'mode': Payment.Mode.TT,
                'notes': f'Auto-created from Commercial Invoice {instance.invoice_number}',
            },
        )
        if not was_created:
            changed = False
            if float(payment.amount or 0) != ci_total_d:
                payment.amount = ci_total_d
                changed = True
            new_currency = instance.currency or 'USD'
            if payment.currency != new_currency:
                payment.currency = new_currency
                changed = True
            if payment.client_id != instance.client_id:
                payment.client = instance.client
                changed = True
            if changed:
                payment.save(update_fields=['amount', 'currency', 'client'])
    except Exception as e:
        logger.warning(f'Payment sync failed for CI {instance.id}: {e}')


# ── FIRC auto-recording ───────────────────────────────────────────────────
# Whenever Order.firc_received_at or Sample.firc_received_at flips between
# null and not-null, mirror the change into the FIRCRecord table so the
# Finance > FIRC tab lists every confirmed FIRC across both flows.

from .models import FIRCRecord


def _firc_sync_for_order(order):
    if order.firc_received_at:
        FIRCRecord.objects.update_or_create(
            order=order,
            sample__isnull=True,
            payment__isnull=True,
            defaults={
                'status': FIRCRecord.Status.RECEIVED,
                'received_date': order.firc_received_at.date(),
            },
        )
    else:
        FIRCRecord.objects.filter(order=order, sample__isnull=True).delete()


def _firc_sync_for_sample(sample):
    if sample.firc_received_at:
        FIRCRecord.objects.update_or_create(
            sample=sample,
            order__isnull=True,
            payment__isnull=True,
            defaults={
                'status': FIRCRecord.Status.RECEIVED,
                'received_date': sample.firc_received_at.date(),
            },
        )
    else:
        FIRCRecord.objects.filter(sample=sample, order__isnull=True).delete()


def _wire_firc_signals():
    """Lazy-wire so we don't trip on the import order between apps."""
    from orders.models import Order
    from samples.models import Sample

    @receiver(post_save, sender=Order, dispatch_uid='finance.firc_sync_order')
    def _on_order_save(sender, instance, **kwargs):
        try:
            _firc_sync_for_order(instance)
        except Exception as e:
            logger.warning(f'FIRC sync failed for Order {instance.id}: {e}')

    @receiver(post_save, sender=Sample, dispatch_uid='finance.firc_sync_sample')
    def _on_sample_save(sender, instance, **kwargs):
        try:
            _firc_sync_for_sample(instance)
        except Exception as e:
            logger.warning(f'FIRC sync failed for Sample {instance.id}: {e}')


_wire_firc_signals()
