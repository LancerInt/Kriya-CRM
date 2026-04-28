"""
Signals that keep PurchaseHistory in sync with Order / OrderItem.

A PurchaseHistory record exists for every (client, order, product_name) line
on every Sales Order — created the moment a line item is added, updated
on edits, and removed if the line is removed. The `status` field tracks
the parent order's lifecycle: pending while the order is in flight, completed
once it reaches 'arrived' / 'delivered'.
"""
from decimal import Decimal

from django.db.models import Sum
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from .models import Order, OrderItem


def _derived_status(order):
    return 'completed' if order.status in ('arrived', 'delivered') else 'pending'


def _recompute_order_total(order_id):
    """Recalculate Order.total as the sum of its line items."""
    if not order_id:
        return
    agg = OrderItem.objects.filter(order_id=order_id).aggregate(s=Sum('total_price'))
    new_total = agg['s'] or Decimal('0')
    Order.objects.filter(pk=order_id).update(total=new_total)


@receiver(post_save, sender=OrderItem)
def sync_on_item_save(sender, instance, **kwargs):
    from clients.models import PurchaseHistory
    order = instance.order
    if not order or order.is_deleted:
        return

    # 1. Refresh the parent order's total so the Sales Orders list shows
    #    a real value instead of $0.
    _recompute_order_total(order.pk)

    if not order.client_id:
        return

    # 2. Mirror the line into PurchaseHistory.
    purchase_date = order.po_received_date or (order.created_at.date() if order.created_at else None)
    PurchaseHistory.objects.update_or_create(
        client=order.client, order=order, product_name=instance.product_name,
        is_deleted=False,
        defaults={
            'product': instance.product,
            'quantity': instance.quantity,
            'unit': instance.unit,
            'unit_price': instance.unit_price,
            'total_price': instance.total_price,
            'currency': order.currency or 'USD',
            'purchase_date': purchase_date,
            'invoice_number': order.order_number or '',
            'status': _derived_status(order),
        },
    )


@receiver(post_delete, sender=OrderItem)
def sync_on_item_delete(sender, instance, **kwargs):
    from clients.models import PurchaseHistory
    if not instance.order_id:
        return
    _recompute_order_total(instance.order_id)
    PurchaseHistory.objects.filter(
        order_id=instance.order_id, product_name=instance.product_name, is_deleted=False,
    ).update(is_deleted=True)


@receiver(post_save, sender=Order)
def sync_purchase_history_on_order_save(sender, instance, **kwargs):
    """When an order changes status, propagate the derived pending/completed
    state to its purchase-history rows."""
    from clients.models import PurchaseHistory
    target = _derived_status(instance)
    PurchaseHistory.objects.filter(order=instance, is_deleted=False).exclude(status=target).update(status=target)
