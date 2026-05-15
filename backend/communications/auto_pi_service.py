"""
Auto PI Service — detects proforma invoice requests from incoming emails
and auto-creates a draft PI for the client.
"""
import re
import logging

logger = logging.getLogger(__name__)

# Patterns that indicate client is asking for a Proforma Invoice
# Includes common misspellings: performa, profoma, profrma, perfoma
PI_INTENT_PATTERNS = [
    r'\bproforma\s*invoice\b',                # proforma invoice
    r'\bperforma\s*invoice\b',                # performa invoice (misspelling)
    r'\bprofoma\s*invoice\b',                 # profoma invoice (misspelling)
    r'\bperfoma\s*invoice\b',                 # perfoma invoice (misspelling)
    r'\bproforma\b',                          # standalone "proforma"
    r'\bperforma\b',                          # standalone "performa"
    r'\bprofoma\b',                           # standalone "profoma"
    r'\bperfoma\b',                           # standalone "perfoma"
    r'\bPI\b',                                # standalone "PI" (case-sensitive checked below)
    r'\bPI\s+(for|of|please|send|need|require)\b',
    r'\bsend\s+(me\s+)?(a\s+)?(the\s+)?PI\b',
    r'\bneed\s+(a\s+)?(the\s+)?PI\b',
    r'\bpls\s+send\s+(me\s+)?(a\s+)?(the\s+)?(PI|proforma|performa|profoma)\b',
    r'\bplease\s+send\s+(me\s+)?(a\s+)?(the\s+)?(PI|proforma|performa|profoma)\b',
    r'\brequire\s+(a\s+)?PI\b',
    r'\bprepare\s+(a\s+)?(the\s+)?PI\b',
    r'\bgenerate\s+(a\s+)?(the\s+)?PI\b',
    r'\bPI\s+copy\b',
    r'\bPI\s+document\b',
    r'\bforward\s+(the\s+)?PI\b',
    r'\bshare\s+(the\s+)?PI\b',
    r'\bPI\s+ready\b',
    r'\bwhere\s+is\s+(the\s+)?PI\b',
    r'\bwaiting\s+for\s+(the\s+)?PI\b',
    r'\bpending\s+PI\b',
    r'\bsend\s+(me\s+)?(a\s+)?(the\s+)?(proforma|performa|profoma)\b',
    r'\bneed\s+(a\s+)?(the\s+)?(proforma|performa|profoma)\b',
]


def _extract_latest_reply(text):
    """
    Extract only the latest reply from an email thread.
    Strips quoted previous messages (lines starting with >, On ... wrote:, etc.)
    """
    lines = text.split('\n')
    latest_lines = []
    for line in lines:
        stripped = line.strip()
        # Stop at quoted content markers
        if re.match(r'^On\s+.+wrote:\s*$', stripped):
            break
        if re.match(r'^-{3,}\s*(Original|Forwarded)\s+Message', stripped, re.IGNORECASE):
            break
        if re.match(r'^From:\s+', stripped):
            break
        if re.match(r'^>{1,}', stripped):
            break
        if re.match(r'^Sent from my (iPhone|iPad|Galaxy|Android)', stripped, re.IGNORECASE):
            break
        latest_lines.append(line)
    return '\n'.join(latest_lines).strip()


def detect_pi_intent(text):
    """
    Check if the message contains a proforma invoice request.
    Returns (is_pi_request: bool, confidence: float)
    """
    if not text:
        return False, 0.0

    matches = 0
    for pattern in PI_INTENT_PATTERNS:
        # "PI" patterns need case-sensitive match to avoid false positives
        if pattern == r'\bPI\b':
            if re.search(pattern, text):
                matches += 1
        elif re.search(pattern, text, re.IGNORECASE):
            matches += 1

    if matches == 0:
        return False, 0.0

    confidence = min(0.5 + matches * 0.2, 1.0)
    return True, confidence


def process_communication_for_pi(communication):
    """
    Check if an inbound communication is a PI request.
    If yes, auto-create a draft ProformaInvoice for the client.
    Returns ProformaInvoice or None.
    """
    from finance.models import ProformaInvoice
    from .backfill_guard import is_historical_communication

    # Historical / backfilled email — storage only, no automation.
    if is_historical_communication(communication):
        return None

    # Skip outbound or non-client emails
    if communication.direction != 'inbound':
        return None
    if not communication.client:
        return None

    # Get message text — extract only the LATEST reply (not the full thread)
    body = communication.body or ''
    text = re.sub(r'<[^>]+>', ' ', body)
    text = re.sub(r'\s+', ' ', text).strip()

    # Extract latest reply from thread to avoid matching quoted old messages
    latest_reply = _extract_latest_reply(text)
    # Use latest reply for detection, but fall back to full text if reply is too short
    check_text = latest_reply if len(latest_reply) >= 5 else text
    if communication.subject:
        check_text = f"{communication.subject}\n{check_text}"

    if not check_text or len(check_text.strip()) < 5:
        return None

    # Detect PI intent — must be in the latest reply or subject, not in quoted thread
    is_pi, confidence = detect_pi_intent(check_text)
    if not is_pi:
        return None

    # Double-check: if the latest reply alone has no PI keywords and the subject
    # is a Re:/Fwd: thread, then PI keyword is likely from quoted content — skip
    if latest_reply and len(latest_reply) >= 5:
        subject = communication.subject or ''
        is_reply_thread = bool(re.match(r'^(Re|Fwd|Fw)\s*:', subject, re.IGNORECASE))
        reply_has_pi, _ = detect_pi_intent(latest_reply)
        subject_has_pi, _ = detect_pi_intent(subject)
        if is_reply_thread and not reply_has_pi and not subject_has_pi:
            logger.debug(f'PI keyword only in quoted thread for comm {communication.id}, skipping')
            return None

    # Check if a PI already exists in the same email thread (avoid duplicates)
    if communication.comm_type == 'email':
        from .auto_quote_service import _find_thread_communication_ids
        thread_comm_ids = _find_thread_communication_ids(communication)
        thread_comm_ids.append(communication.id)
        existing_thread_pi = ProformaInvoice.objects.filter(
            source_communication_id__in=thread_comm_ids,
            is_deleted=False,
        ).first()
        if existing_thread_pi:
            logger.info(f'Skipping PI for comm {communication.id} — PI {existing_thread_pi.invoice_number} already exists in same thread')
            return existing_thread_pi

    # Check if this exact communication already produced a PI (avoid re-processing)
    existing = ProformaInvoice.objects.filter(
        client=communication.client,
        status='draft',
        is_deleted=False,
        created_at__gte=communication.created_at,
    ).first()
    if existing and existing.items.filter(product_name='').exists():
        _fill_pi_items(existing, check_text)
        logger.info(f'Updated empty items in existing draft PI {existing.invoice_number}')
        return existing

    logger.info(f'PI intent detected (confidence={confidence}) for comm {communication.id}')

    # Create a draft PI
    from finance.models import ProformaInvoiceItem
    from finance.pi_service import DEFAULT_BANK
    from datetime import date

    client = communication.client
    count = ProformaInvoice.objects.count() + 1
    today = date.today()
    invoice_number = f'{today.strftime("%y-%m")}/KB-{count:03d}'

    pi = ProformaInvoice.objects.create(
        client=client,
        source_communication=communication,
        invoice_number=invoice_number,
        invoice_date=today,
        created_by=communication.user,
        client_company_name=client.company_name,
        client_tax_number=client.tax_number or '',
        client_address=client.address or '',
        client_pincode=client.postal_code or '',
        client_city_state_country=f'{client.city}, {client.state}, {client.country}'.strip(', '),
        client_phone=client.phone_number or (client.contacts.filter(is_primary=True, is_deleted=False).first().phone if client.contacts.filter(is_primary=True, is_deleted=False).exists() else ''),
        country_of_origin='India',
        country_of_final_destination=client.country or '',
        currency=client.preferred_currency or 'USD',
        bank_details=DEFAULT_BANK,
        display_overrides={
            '_attend': f"Attend: {client.contacts.filter(is_primary=True, is_deleted=False).first().name}" if client.contacts.filter(is_primary=True, is_deleted=False).exists() else '',
        },
    )

    _fill_pi_items(pi, check_text)

    # Notify the assigned executive
    try:
        assigned_to = client.primary_executive or communication.user
        if assigned_to:
            from notifications.models import Notification
            Notification.objects.create(
                user=assigned_to,
                notification_type='alert',
                title=f'PI requested by {client.company_name}',
                message=f'{client.company_name} has requested a Proforma Invoice via email. Draft PI {invoice_number} has been created.',
                link='/proforma-invoices',
            )
    except Exception as e:
        logger.error(f'Failed to create PI notification: {e}')

    logger.info(f'Draft PI {invoice_number} auto-created for client {client.company_name}')
    return pi


def _fill_pi_items(pi, text):
    """Extract product info from email text and fill PI items."""
    from finance.models import ProformaInvoiceItem
    from communications.quote_request_parser import extract_quote_fields

    fields = extract_quote_fields(text)
    raw_product_text = fields.get('product', '')
    quantity = 0
    unit = fields.get('unit', 'Ltrs')

    try:
        quantity = float(fields.get('quantity', 0)) if fields.get('quantity') else 0
    except (ValueError, TypeError):
        pass

    # Match to Product master
    matched_product = None
    pi_product_name = ''
    pi_description = ''

    if raw_product_text:
        try:
            from communications.auto_quote_service import _match_product
            matched_product = _match_product(raw_product_text)
        except Exception:
            pass

    if matched_product:
        # client_brand_names -> PI Product Details
        brand_names = [b.strip() for b in matched_product.client_brand_names.split(',') if b.strip()]
        if brand_names:
            raw_lower = raw_product_text.lower()
            best_brand = brand_names[0]
            for bn in brand_names:
                if bn.lower() in raw_lower or raw_lower in bn.lower():
                    best_brand = bn
                    break
            pi_product_name = best_brand
        else:
            pi_product_name = raw_product_text
        # Product.name -> PI Description of Goods
        pi_description = str(matched_product)
    else:
        pi_product_name = raw_product_text

    # Get client-specific price, fallback to product base price
    from communications.auto_quote_service import _get_client_price
    base_price = _get_client_price(pi.client, matched_product)
    line_total = quantity * base_price

    # Delete empty items and create filled one
    pi.items.filter(product_name='').delete()
    ProformaInvoiceItem.objects.create(
        pi=pi,
        product_name=pi_product_name,
        client_product_name=pi_product_name,
        description_of_goods=pi_description,
        quantity=quantity,
        unit=unit,
        unit_price=base_price,
        total_price=line_total,
    )

    # Update PI total
    if line_total > 0:
        pi.total = line_total
        from finance.pi_service import _number_to_words
        pi.amount_in_words = _number_to_words(line_total, pi.currency)
        pi.save(update_fields=['total', 'amount_in_words'])
