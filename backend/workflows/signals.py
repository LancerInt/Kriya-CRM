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


def _email_client_status(shipment, title, message):
    """Send status update email to client's primary contact, continuing
    in the same email thread as the original quotation/PI conversation."""
    contact = shipment.client.contacts.filter(is_deleted=False).order_by('-is_primary').first()
    if not contact or not contact.email:
        return

    from communications.models import EmailAccount, Communication
    email_account = EmailAccount.objects.filter(is_active=True).first()
    if not email_account:
        return

    # Continue in the same email thread as the original conversation
    from communications.services import get_thread_headers
    in_reply_to, references, original_subject = get_thread_headers(shipment.client)

    if original_subject:
        subject = f'Re: {original_subject}' if not original_subject.startswith('Re:') else original_subject
    else:
        subject = f'Shipment Update: {title}'

    from communications.services import EmailService
    body_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#1e3a5f;">Shipment Update: {title}</h2>
        <p>Dear {contact.name},</p>
        <p>{message}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#666;width:140px;">Container</td><td style="padding:8px;">{shipment.container_number or 'TBD'}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">B/L Number</td><td style="padding:8px;">{shipment.bl_number or 'TBD'}</td></tr>
            <tr><td style="padding:8px;color:#666;">ETA</td><td style="padding:8px;">{shipment.estimated_arrival or 'TBD'}</td></tr>
        </table>
        <p>Best regards,<br/>Kriya Biosys Private Limited</p>
    </div>
    """
    EmailService.send_email(
        email_account=email_account, to=contact.email,
        subject=subject,
        body_html=body_html,
        in_reply_to=in_reply_to,
        references=references,
    )
    Communication.objects.create(
        client=shipment.client, contact=contact,
        comm_type='email', direction='outbound',
        subject=subject,
        body=body_html, status='sent', email_account=email_account,
        external_email=contact.email,
    )
    logger.info(f'Status email sent to {contact.email} for shipment {shipment.id}')


# ---------------------------------------------------------------------------
# Client Shadow Executive Change → Notify old/new executive
# ---------------------------------------------------------------------------

@receiver(pre_save, sender='clients.Client')
def capture_previous_shadow(sender, instance, **kwargs):
    if instance.pk:
        try:
            instance._previous_shadow = sender.objects.filter(pk=instance.pk).values_list('shadow_executive_id', flat=True).first()
        except Exception:
            instance._previous_shadow = None
    else:
        instance._previous_shadow = None


@receiver(post_save, sender='clients.Client')
def on_shadow_executive_change(sender, instance, created, **kwargs):
    if created:
        return
    previous = getattr(instance, '_previous_shadow', None)
    current = instance.shadow_executive_id

    if previous == current:
        return

    from notifications.models import Notification

    # Notify the NEW shadow executive
    if current and instance.shadow_executive:
        Notification.objects.create(
            user=instance.shadow_executive,
            notification_type='system',
            title=f'Shadow client assigned: {instance.company_name}',
            message=f'You have been assigned as shadow executive for {instance.company_name}. You now have access to their data.',
            link=f'/clients/{instance.id}',
        )

    # Notify the OLD shadow executive
    if previous:
        from accounts.models import User
        try:
            old_user = User.objects.get(id=previous)
            if current:
                new_name = instance.shadow_executive.full_name if instance.shadow_executive else 'another executive'
                msg = f'You have been removed as shadow executive for {instance.company_name}. Access transferred to {new_name}.'
            else:
                msg = f'You have been removed as shadow executive for {instance.company_name}. You no longer have access to their data.'
            Notification.objects.create(
                user=old_user,
                notification_type='alert',
                title=f'Shadow access removed: {instance.company_name}',
                message=msg,
                link='/clients',
            )
        except User.DoesNotExist:
            pass

    # Notify the primary executive
    if instance.primary_executive and instance.primary_executive_id != current and instance.primary_executive_id != previous:
        if current and instance.shadow_executive:
            Notification.objects.create(
                user=instance.primary_executive,
                notification_type='system',
                title=f'Shadow executive updated for {instance.company_name}',
                message=f'{instance.shadow_executive.full_name} is now the shadow executive for {instance.company_name}.',
                link=f'/clients/{instance.id}',
            )


# ---------------------------------------------------------------------------
# Shipment Status Change → Update Order + Notify Team + Email Client
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
    """Notify team and auto-email client on every shipment status change."""
    previous = getattr(instance, '_previous_status', None)
    current = instance.status

    if current == previous or created:
        return

    from notifications.models import Notification

    # Status display messages for client emails
    STATUS_MESSAGES = {
        'factory_ready': ('Product Readiness', 'Your product is ready for dispatch.'),
        'container_booked': ('Container Booked', 'A container/vessel has been booked for your shipment.'),
        'packed': ('Shipment Packed', 'Your order has been packed and is ready for inspection.'),
        'inspection': ('Under Inspection', 'Your shipment is currently under quality inspection.'),
        'inspection_passed': ('Inspection Passed', 'Your shipment has passed quality inspection and will be dispatched soon.'),
        'dispatched': ('Shipment Dispatched', f'Your shipment has been dispatched. Container: {instance.container_number or "TBD"}, B/L: {instance.bl_number or "TBD"}.'),
        'in_transit': ('In Transit', f'Your shipment is now in transit. ETA: {instance.estimated_arrival or "TBD"}.'),
        'arrived': ('Arrived at Port', 'Your shipment has arrived at the destination port.'),
        'customs': ('Customs Clearance', 'Your shipment is currently under customs clearance.'),
        'delivered': ('Delivered', 'Your shipment has been successfully delivered.'),
    }

    title, message = STATUS_MESSAGES.get(current, (current, f'Shipment status updated to {current}.'))
    client_name = instance.client.company_name if instance.client else 'N/A'

    # Update order status for key stages
    order = instance.order
    if order:
        if current == 'dispatched' and order.status not in ('shipped', 'delivered', 'cancelled'):
            order.status = 'shipped'
            order.save(update_fields=['status', 'updated_at'])
        elif current == 'delivered' and order.status != 'delivered':
            order.status = 'delivered'
            order.save(update_fields=['status', 'updated_at'])

    # Notify internal team
    notified = set()
    if order and order.created_by:
        Notification.objects.create(
            user=order.created_by, notification_type='alert',
            title=f'{instance.shipment_number}: {title}',
            message=f'Shipment {instance.shipment_number} for {client_name} - {message}',
            link=f'/shipments/{instance.id}',
        )
        notified.add(order.created_by.id)

    if instance.client and instance.client.primary_executive and instance.client.primary_executive.id not in notified:
        Notification.objects.create(
            user=instance.client.primary_executive, notification_type='alert',
            title=f'{instance.shipment_number}: {title}',
            message=f'Shipment for {client_name} - {message}',
            link=f'/shipments/{instance.id}',
        )

    # Auto-email client at key stages
    if current in ('dispatched', 'arrived'):
        try:
            _email_client_status(instance, title, message)
        except Exception as e:
            logger.error(f'Failed to email client status: {e}')


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
