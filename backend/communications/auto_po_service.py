"""
Auto PO Service — detects Purchase Order intent from inbound emails/WhatsApp
and auto-creates a Sales Order from the most recent sent PI for that client.

Flow:
1. Detect PO keywords in inbound message
2. Find the most recent SENT ProformaInvoice for the client
3. Create an Order with items copied from the PI
4. Notify the assigned executive
"""
import re
import logging

logger = logging.getLogger(__name__)

# PO intent detection patterns
PO_INTENT_PATTERNS = [
    r'\bpurchase\s+order\b',
    r'\bPO\b',                       # case-sensitive — "PO" not "po"
    r'\bP\.O\b',
    r'\bPO\s*#',
    r'\bPO\s*number\b',
    r'\bPO\s*no\b',
    r'\bplace\s+(the\s+)?order\b',
    r'\bconfirm\s+(the\s+)?order\b',
    r'\bwe\s+confirm\b',
    r'\border\s+confirmed?\b',
    r'\bplease\s+proceed\b',
    r'\bgo\s+ahead\b',
    r'\baccept(ed)?\s+(the\s+)?(quotation|quote|PI|proforma)\b',
    r'\bapproved?\s+(the\s+)?(quotation|quote|PI|proforma)\b',
]

# Patterns that indicate it's NOT a PO (avoid false positives)
PO_NEGATIVE_PATTERNS = [
    r'\bsend\s+(us\s+)?(a\s+)?PO\b',       # "send us a PO" = asking for PO, not sending one
    r'\bdo\s+you\s+have\s+(a\s+)?PO\b',
    r'\bPO\s+template\b',
    r'\bwait(ing)?\s+for\s+(the\s+)?PO\b',
]


def _extract_latest_reply(text):
    """Extract only the latest reply from an email thread."""
    lines = text.split('\n')
    result = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith('>') or stripped.startswith('On ') and 'wrote:' in stripped:
            break
        if re.match(r'^-{3,}', stripped) or re.match(r'^_{3,}', stripped):
            break
        if re.match(r'^From:\s', stripped, re.IGNORECASE):
            break
        result.append(line)
    return '\n'.join(result).strip()


def detect_po_intent(text):
    """Check if the message contains Purchase Order / order confirmation intent."""
    if not text:
        return False, 0.0

    # Check negative patterns first
    for pattern in PO_NEGATIVE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return False, 0.0

    matches = 0
    for pattern in PO_INTENT_PATTERNS:
        # "PO" and "P.O" need case-sensitive match
        if pattern in (r'\bPO\b', r'\bP\.O\b', r'\bPO\s*#'):
            if re.search(pattern, text):
                matches += 1
        elif re.search(pattern, text, re.IGNORECASE):
            matches += 1

    if matches == 0:
        return False, 0.0

    confidence = min(0.5 + matches * 0.2, 1.0)
    return True, confidence


def process_communication_for_po(communication):
    """
    Check if an inbound communication is a PO / order confirmation.
    If yes, auto-create a Sales Order from the most recent sent PI.
    Returns Order or None.
    """
    from orders.models import Order

    # Skip outbound or non-client emails
    if communication.direction != 'inbound':
        return None
    if not communication.client:
        return None

    # Get message text
    body = communication.body or ''
    text = re.sub(r'<[^>]+>', ' ', body)
    text = re.sub(r'\s+', ' ', text).strip()

    # Extract latest reply to avoid matching quoted old messages
    latest_reply = _extract_latest_reply(text)
    check_text = latest_reply if len(latest_reply) >= 5 else text
    if communication.subject:
        check_text = f"{communication.subject}\n{check_text}"

    if not check_text or len(check_text.strip()) < 5:
        return None

    # Detect PO intent
    is_po, confidence = detect_po_intent(check_text)
    if not is_po:
        return None

    # Double-check: if only found in quoted thread, skip
    if latest_reply and len(latest_reply) >= 5:
        subject = communication.subject or ''
        is_reply_thread = bool(re.match(r'^(Re|Fwd|Fw)\s*:', subject, re.IGNORECASE))
        reply_has_po, _ = detect_po_intent(latest_reply)
        subject_has_po, _ = detect_po_intent(subject)
        if is_reply_thread and not reply_has_po and not subject_has_po:
            logger.debug(f'PO keyword only in quoted thread for comm {communication.id}, skipping')
            return None

    logger.info(f'PO intent detected (confidence={confidence}) for comm {communication.id}')

    client = communication.client
    from finance.models import ProformaInvoice

    # Step 1: Look for a sent PI in the SAME email thread first
    from .auto_quote_service import _find_thread_communication_ids
    thread_comm_ids = _find_thread_communication_ids(communication)
    thread_comm_ids.append(communication.id)

    sent_pi = None
    thread_pis = ProformaInvoice.objects.filter(
        source_communication_id__in=thread_comm_ids,
        status='sent',
        is_deleted=False,
    ).order_by('-created_at')

    for pi in thread_pis:
        if pi.order_id:
            logger.info(f'Order already exists for thread PI {pi.invoice_number}')
            return pi.order
        sent_pi = pi
        break

    # Step 2: If no thread PI, find the most recent sent PI WITHOUT an order
    if not sent_pi:
        sent_pi = ProformaInvoice.objects.filter(
            client=client,
            status='sent',
            is_deleted=False,
            order__isnull=True,
        ).order_by('-created_at').first()

    if not sent_pi:
        # No PI available — create a direct order from the email content
        logger.info(f'No unlinked sent PI for {client.company_name} — creating direct order from email')
        return _create_direct_order(communication, client, check_text)

    # Create the order from the PI
    from orders.models import OrderItem
    order_count = Order.objects.count() + 1
    order = Order.objects.create(
        order_number=f'ORD-{order_count:05d}',
        client=client,
        order_type='pi_based',
        status='confirmed',
        currency=sent_pi.currency or 'USD',
        delivery_terms=sent_pi.terms_of_delivery.split(' - ')[0].strip() if sent_pi.terms_of_delivery else 'FOB',
        payment_terms=sent_pi.terms_of_trade or '',
        total=sent_pi.total or 0,
        notes=f'Auto-created from PO email. Converted from PI {sent_pi.invoice_number}',
        created_by=communication.user,
    )

    # Copy items from PI
    for item in sent_pi.items.all():
        OrderItem.objects.create(
            order=order,
            product_name=item.product_name or '',
            client_product_name=item.client_product_name or '',
            description=item.description_of_goods or '',
            quantity=item.quantity or 0,
            unit=item.unit or 'KG',
            unit_price=item.unit_price or 0,
            total_price=(item.quantity or 0) * (item.unit_price or 0),
        )

    # Link PI to order
    sent_pi.order = order
    sent_pi.save(update_fields=['order'])

    # Notify
    try:
        from notifications.utils import notify
        notify(
            title=f'Order {order.order_number} auto-created',
            message=f'PO received from {client.company_name} via email. Order created from PI {sent_pi.invoice_number}.',
            notification_type='system',
            link=f'/orders/{order.id}',
            client=client,
        )
    except Exception:
        pass

    logger.info(f'Order {order.order_number} auto-created from PI {sent_pi.invoice_number} for client {client.company_name}')
    return order


def _create_direct_order(communication, client, text):
    """Create a direct order from email content when no PI is available.
    Extracts product name and quantity from the email body."""
    from orders.models import Order, OrderItem

    # Extract product and quantity from email
    product_name = ''
    quantity = 0
    unit = 'KG'

    # Try to find "Product: xxx" pattern — stop at next field label, newline, or punctuation
    prod_match = re.search(r'Product\s*:\s*(.+?)(?=\s*(?:Quantity|Specification|Price|Amount|Total|Delivery|Payment|Please|$))', text, re.IGNORECASE)
    if prod_match:
        product_name = prod_match.group(1).strip().rstrip('.,;:')

    # Try to find "Quantity: xxx" pattern
    qty_match = re.search(r'Quantity\s*:\s*(\d+[\.,]?\d*)\s*(MT|KG|KGS|LTR|LTRS|GAL|Nos|nos|ton|tons|kg|litre|litres|liter|liters|gallon|gallons|pcs|pieces|bags|drums)?', text, re.IGNORECASE)
    if qty_match:
        quantity = float(qty_match.group(1).replace(',', '.'))
        unit = qty_match.group(2) or 'KG'
        # Normalize unit
        unit_map = {'ton': 'MT', 'tons': 'MT', 'kgs': 'KG', 'kg': 'KG', 'nos': 'PCS',
                     'pcs': 'PCS', 'pieces': 'PCS', 'bags': 'BAGS', 'drums': 'DRUMS',
                     'litre': 'L', 'litres': 'L', 'liter': 'L', 'liters': 'L',
                     'gallon': 'GAL', 'gallons': 'GAL', 'ltr': 'L', 'ltrs': 'L'}
        unit = unit_map.get(unit.lower(), unit.upper())

    if not product_name:
        # Fallback: use subject
        product_name = communication.subject or 'Product from PO email'
    # Truncate to fit DB field
    product_name = product_name[:250]

    # Look up product price from Products table
    unit_price = 0
    try:
        from products.models import Product
        product = Product.objects.filter(
            name__icontains=product_name.split()[0] if product_name else '',
            is_deleted=False,
        ).first()
        if product:
            unit_price = float(product.base_price or 0)
    except Exception:
        pass

    order_count = Order.objects.count() + 1
    order = Order.objects.create(
        order_number=f'ORD-{order_count:05d}',
        client=client,
        order_type='direct',
        status='confirmed',
        currency=client.preferred_currency or 'USD',
        total=quantity * unit_price,
        notes=f'Auto-created from PO email: {communication.subject or ""}',
        created_by=communication.user,
    )

    OrderItem.objects.create(
        order=order,
        product_name=product_name,
        quantity=quantity or 1,
        unit=unit,
        unit_price=unit_price,
        total_price=quantity * unit_price,
    )

    # Notify
    try:
        from notifications.utils import notify
        notify(
            title=f'Order {order.order_number} auto-created',
            message=f'PO received from {client.company_name} via email. Direct order created.',
            notification_type='system',
            link=f'/orders/{order.id}',
            client=client,
        )
    except Exception:
        pass

    logger.info(f'Direct order {order.order_number} created from PO email for {client.company_name} — product: {product_name}')
    return order
