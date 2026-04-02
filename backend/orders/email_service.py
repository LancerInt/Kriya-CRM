"""
Order Email Service — sends and logs all order-related emails.
"""
import logging
from django.utils import timezone

logger = logging.getLogger(__name__)

STATUS_EMAIL_TEMPLATES = {
    'inspection_passed': {
        'subject': 'Inspection Passed - {order_number}',
        'body': 'Your order {order_number} has passed quality inspection and will be dispatched shortly.',
    },
    'dispatched': {
        'subject': 'Shipment Dispatched - {order_number}',
        'body': 'Your order {order_number} has been dispatched. Container: {container}, B/L: {bl_number}. ETA: {eta}.',
    },
    'in_transit': {
        'subject': 'Shipment In Transit - {order_number}',
        'body': 'Your order {order_number} is now in transit. ETA: {eta}.',
    },
    'delivered': {
        'subject': 'Order Delivered - {order_number}',
        'body': 'Your order {order_number} has been successfully delivered. Thank you for your business.',
    },
}


def send_order_status_email(order, status):
    """Send a status update email to the client and log it."""
    from orders.models import EmailLog, WorkflowEventLog

    template = STATUS_EMAIL_TEMPLATES.get(status)
    if not template:
        return

    # Get client contact
    contact = order.client.contacts.filter(is_deleted=False).order_by('-is_primary').first()
    if not contact or not contact.email:
        logger.warning(f'No contact email for {order.client.company_name}')
        return

    # Get email account
    from communications.models import EmailAccount
    email_account = EmailAccount.objects.filter(is_active=True).first()
    if not email_account:
        logger.warning('No active email account for sending')
        return

    # Get shipment data for templates
    shipment = order.shipments.first()
    container = shipment.container_number if shipment else 'TBD'
    bl_number = shipment.bl_number if shipment else 'TBD'
    eta = str(shipment.estimated_arrival) if shipment and shipment.estimated_arrival else 'TBD'

    # Build email
    subject = template['subject'].format(order_number=order.order_number)
    body_text = template['body'].format(
        order_number=order.order_number,
        container=container, bl_number=bl_number, eta=eta,
    )

    body_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#1e3a5f;">Order Update: {order.order_number}</h2>
        <p>Dear {contact.name},</p>
        <p>{body_text}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:8px;color:#666;width:140px;">Order No.</td><td style="padding:8px;font-weight:bold;">{order.order_number}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">Status</td><td style="padding:8px;">{order.get_status_display()}</td></tr>
            <tr><td style="padding:8px;color:#666;">Client</td><td style="padding:8px;">{order.client.company_name}</td></tr>
            <tr style="background:#f9f9f9;"><td style="padding:8px;color:#666;">Total</td><td style="padding:8px;">{order.currency} {order.total:,.2f}</td></tr>
        </table>
        <p>Best regards,<br/>Kriya Biosys Private Limited</p>
    </div>
    """

    # Send
    error_msg = ''
    try:
        from communications.services import EmailService
        EmailService.send_email(
            email_account=email_account, to=contact.email,
            subject=subject, body_html=body_html,
        )
    except Exception as e:
        error_msg = str(e)
        logger.error(f'Email send failed: {e}')

    # Log in EmailLog
    EmailLog.objects.create(
        order=order, to_email=contact.email,
        subject=subject, body=body_html,
        status='sent' if not error_msg else 'failed',
        error=error_msg, triggered_by=f'status_change:{status}',
    )

    # Log in WorkflowEventLog
    WorkflowEventLog.objects.create(
        order=order, event_type='email_sent',
        description=f'Status email sent to {contact.email}: {subject}',
        metadata={'to': contact.email, 'status': status, 'error': error_msg},
    )

    # Also create Communication record
    from communications.models import Communication
    Communication.objects.create(
        client=order.client, contact=contact,
        comm_type='email', direction='outbound',
        subject=subject, body=body_html, status='sent',
        email_account=email_account, external_email=contact.email,
    )

    logger.info(f'Status email sent for {order.order_number} → {contact.email}')


def send_quotation_email(quotation, user):
    """Send quotation to client via email. Called from quotation views."""
    from orders.models import EmailLog
    from communications.models import EmailAccount

    contact = quotation.client.contacts.filter(is_deleted=False).order_by('-is_primary').first()
    if not contact or not contact.email:
        raise ValueError(f'Contact {contact.name if contact else "N/A"} has no email')

    email_account = EmailAccount.objects.filter(user=user, is_active=True).first()
    if not email_account:
        email_account = EmailAccount.objects.filter(is_active=True).first()
    if not email_account:
        raise ValueError('No email account configured')

    # Build items table
    items_html = ''
    for i, item in enumerate(quotation.items.all(), 1):
        items_html += f'''<tr>
            <td style="padding:8px;border:1px solid #eee;">{i}</td>
            <td style="padding:8px;border:1px solid #eee;">{item.product_name}</td>
            <td style="padding:8px;border:1px solid #eee;text-align:right;">{item.quantity:,.0f} {item.unit}</td>
            <td style="padding:8px;border:1px solid #eee;text-align:right;">{quotation.currency} {item.unit_price:,.2f}</td>
            <td style="padding:8px;border:1px solid #eee;text-align:right;">{quotation.currency} {item.total_price:,.2f}</td>
        </tr>'''

    subject = f'Quotation {quotation.quotation_number} - Kriya Biosys Private Limited'
    body_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:700px;">
        <h2 style="color:#1e3a5f;">Quotation - {quotation.quotation_number}</h2>
        <p>Dear {contact.name},</p>
        <p>Please find below our quotation:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:6px;color:#666;width:140px;">Delivery Terms</td><td style="padding:6px;">{quotation.get_delivery_terms_display()}</td></tr>
            <tr><td style="padding:6px;color:#666;">Payment Terms</td><td style="padding:6px;">{quotation.get_payment_terms_display() if quotation.payment_terms else 'As agreed'}</td></tr>
            <tr><td style="padding:6px;color:#666;">Freight</td><td style="padding:6px;">{quotation.get_freight_terms_display() if quotation.freight_terms else 'TBD'}</td></tr>
            <tr><td style="padding:6px;color:#666;">Validity</td><td style="padding:6px;">{quotation.validity_days} days</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;">
            <tr style="background:#1e3a5f;color:white;">
                <th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">Product</th>
                <th style="padding:8px;text-align:right;">Qty</th><th style="padding:8px;text-align:right;">Price</th>
                <th style="padding:8px;text-align:right;">Total</th>
            </tr>
            {items_html}
            <tr style="font-weight:bold;background:#f5f5f5;">
                <td colspan="4" style="padding:8px;text-align:right;">Total:</td>
                <td style="padding:8px;text-align:right;">{quotation.currency} {quotation.total:,.2f}</td>
            </tr>
        </table>
        <p>Please confirm your acceptance.</p>
        <p>Best regards,<br/>Kriya Biosys Private Limited</p>
    </div>
    """

    from communications.services import EmailService
    EmailService.send_email(email_account=email_account, to=contact.email, subject=subject, body_html=body_html)

    # Log
    EmailLog.objects.create(
        to_email=contact.email, subject=subject, body=body_html,
        status='sent', triggered_by='quotation_send',
    )

    return contact.email
