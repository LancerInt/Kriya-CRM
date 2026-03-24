"""
Workflow automation signal handlers.

Handles automatic actions triggered by model changes:
- Shipment dispatched -> update order status + notify
- Payment created -> update invoice status + check FIRC + notify
- Sample delivered -> create feedback reminder task + notify
"""
import logging
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Shipment Dispatched → Update Order status + Notify
# ---------------------------------------------------------------------------

@receiver(pre_save, sender='shipments.Shipment')
def capture_shipment_previous_status(sender, instance, **kwargs):
    """Store the previous status before save so we can detect changes."""
    if instance.pk:
        try:
            instance._previous_status = sender.objects.filter(pk=instance.pk).values_list('status', flat=True).first()
        except Exception:
            instance._previous_status = None
    else:
        instance._previous_status = None


@receiver(post_save, sender='shipments.Shipment')
def on_shipment_status_change(sender, instance, created, **kwargs):
    """When a shipment is dispatched, update the linked order and notify."""
    previous = getattr(instance, '_previous_status', None)
    current = instance.status

    # Shipment dispatched
    if current == 'dispatched' and previous != 'dispatched':
        from orders.models import Order
        from notifications.models import Notification

        # Update the linked order status to shipped
        order = instance.order
        if order and order.status not in ('shipped', 'delivered', 'cancelled'):
            order.status = 'shipped'
            order.save(update_fields=['status', 'updated_at'])
            logger.info(f"Order {order.order_number} status updated to 'shipped' (shipment {instance.shipment_number} dispatched)")

        # Notify the order creator
        if order and order.created_by:
            Notification.objects.create(
                user=order.created_by,
                notification_type='alert',
                title=f'Shipment {instance.shipment_number} dispatched',
                message=f'Shipment {instance.shipment_number} for order {order.order_number} ({order.client.company_name}) has been dispatched.',
                link=f'/shipments/{instance.id}',
            )

        # Notify the client's primary executive if different from order creator
        if instance.client and instance.client.primary_executive:
            exec_user = instance.client.primary_executive
            if not order or exec_user != order.created_by:
                Notification.objects.create(
                    user=exec_user,
                    notification_type='alert',
                    title=f'Shipment {instance.shipment_number} dispatched',
                    message=f'Shipment for {instance.client.company_name} has been dispatched. Container: {instance.container_number or "N/A"}.',
                    link=f'/shipments/{instance.id}',
                )

    # Shipment delivered
    if current == 'delivered' and previous != 'delivered':
        from orders.models import Order
        from notifications.models import Notification

        order = instance.order
        if order and order.status not in ('delivered', 'cancelled'):
            order.status = 'delivered'
            order.save(update_fields=['status', 'updated_at'])
            logger.info(f"Order {order.order_number} status updated to 'delivered' (shipment {instance.shipment_number} delivered)")

        if order and order.created_by:
            Notification.objects.create(
                user=order.created_by,
                notification_type='alert',
                title=f'Shipment {instance.shipment_number} delivered',
                message=f'Shipment {instance.shipment_number} for order {order.order_number} has been delivered.',
                link=f'/shipments/{instance.id}',
            )


# ---------------------------------------------------------------------------
# Payment Created → Update Invoice status + FIRC check + Notify
# ---------------------------------------------------------------------------

@receiver(post_save, sender='finance.Payment')
def on_payment_saved(sender, instance, created, **kwargs):
    """When payment is recorded, update the linked invoice status and notify."""
    if not instance.invoice:
        return

    from finance.models import Invoice
    from notifications.models import Notification
    from decimal import Decimal
    from django.db.models import Sum

    invoice = instance.invoice

    # Calculate total payments for this invoice
    total_paid = invoice.payments.aggregate(
        total=Sum('amount')
    )['total'] or Decimal('0')

    # Determine new invoice status
    if total_paid >= invoice.total:
        new_status = 'paid'
    elif total_paid > Decimal('0'):
        new_status = 'partial'
    else:
        new_status = invoice.status

    if new_status != invoice.status:
        invoice.status = new_status
        invoice.save(update_fields=['status', 'updated_at'])
        logger.info(f"Invoice {invoice.invoice_number} status updated to '{new_status}' (payment of {instance.amount} {instance.currency})")

    # Create notification for the invoice creator
    if invoice.created_by:
        status_label = 'fully paid' if new_status == 'paid' else f'partially paid ({total_paid}/{invoice.total} {invoice.currency})'
        Notification.objects.create(
            user=invoice.created_by,
            notification_type='alert',
            title=f'Payment received for {invoice.invoice_number}',
            message=f'Payment of {instance.amount} {instance.currency} received. Invoice is now {status_label}.',
            link=f'/finance/invoices/{invoice.id}',
        )

    # Check if FIRC record exists; if not, create a pending FIRC reminder notification
    if created:
        from finance.models import FIRCRecord
        firc_exists = FIRCRecord.objects.filter(payment=instance).exists()
        if not firc_exists:
            # Auto-create a pending FIRC record
            FIRCRecord.objects.create(
                payment=instance,
                status='pending',
            )
            logger.info(f"FIRC record auto-created for payment {instance.id}")

            # Notify about pending FIRC
            if invoice.created_by:
                Notification.objects.create(
                    user=invoice.created_by,
                    notification_type='reminder',
                    title=f'FIRC pending for payment on {invoice.invoice_number}',
                    message=f'A FIRC record has been created and is pending for the payment of {instance.amount} {instance.currency}.',
                    link=f'/finance/invoices/{invoice.id}',
                )


# ---------------------------------------------------------------------------
# Sample Delivered → Create Feedback Reminder Task + Notify
# ---------------------------------------------------------------------------

@receiver(pre_save, sender='samples.Sample')
def capture_sample_previous_status(sender, instance, **kwargs):
    """Store the previous status before save so we can detect changes."""
    if instance.pk:
        try:
            instance._previous_status = sender.objects.filter(pk=instance.pk).values_list('status', flat=True).first()
        except Exception:
            instance._previous_status = None
    else:
        instance._previous_status = None


@receiver(post_save, sender='samples.Sample')
def on_sample_delivered(sender, instance, created, **kwargs):
    """When sample status changes to delivered, create feedback reminder task and notify."""
    previous = getattr(instance, '_previous_status', None)
    current = instance.status

    if current == 'delivered' and previous != 'delivered':
        from tasks.models import Task
        from notifications.models import Notification
        from django.utils import timezone
        from datetime import timedelta

        # Create a feedback follow-up task due in 7 days
        task_owner = instance.created_by
        if not task_owner and instance.client and instance.client.primary_executive:
            task_owner = instance.client.primary_executive

        if task_owner:
            product_label = instance.product_name or (instance.product.name if instance.product else 'sample')
            Task.objects.create(
                title=f'Collect feedback for {product_label} sample sent to {instance.client.company_name}',
                description=f'Sample (tracking: {instance.tracking_number or "N/A"}) was delivered. Please follow up with the client for feedback.',
                client=instance.client,
                owner=task_owner,
                created_by=instance.created_by,
                due_date=timezone.now() + timedelta(days=7),
                priority='medium',
                status='pending',
                is_auto_generated=True,
                linked_type='sample',
                linked_id=instance.id,
            )
            logger.info(f"Feedback reminder task created for sample {instance.id} ({instance.client.company_name})")

            Notification.objects.create(
                user=task_owner,
                notification_type='task',
                title=f'Sample delivered to {instance.client.company_name}',
                message=f'Sample of {product_label} has been delivered. A feedback follow-up task has been created (due in 7 days).',
                link=f'/samples/{instance.id}',
            )
