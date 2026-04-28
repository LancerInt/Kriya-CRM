"""
Auto PO Service — detects Purchase Order intent from inbound emails/WhatsApp
and auto-creates a Sales Order from the most recent sent PI for that client.

Flow:
1. Detect PO keywords in inbound message
2. Find the most recent SENT ProformaInvoice for the client
3. Create an Order with items copied from the PI
4. Notify the assigned executive
5. If the PO email itself carries a PDF/doc attachment whose filename looks
   like a PO, copy it onto Order.po_document so the user does not have to
   re-upload manually.
"""
import re
import logging

logger = logging.getLogger(__name__)

# Filename keywords that mark an email attachment as the actual PO document.
# Match conservatively so a "Quotation.pdf" reply attachment is never picked.
# Treat _ as a separator (not a word char) by anchoring to start, end, or
# non-letter boundaries explicitly.
PO_FILENAME_PATTERNS = [
    r'(?:^|[^A-Za-z])PO(?:[^A-Za-z]|$)',
    r'(?:^|[^A-Za-z])P\.?\s*O\.?(?:[^A-Za-z]|$)',
    r'purchase[\s_-]*order',
    r'order[\s_-]*confirm',
    r'(?:^|[^A-Za-z])order[\s_-]*sheet(?:[^A-Za-z]|$)',
]
# Document extensions we accept for the PO file.
PO_DOC_EXTS = ('.pdf', '.docx', '.doc', '.xlsx', '.xls', '.png', '.jpg', '.jpeg')


def _filename_matches_po(filename):
    if not filename:
        return False
    fn = filename.strip()
    if not fn.lower().endswith(PO_DOC_EXTS):
        return False
    for pat in PO_FILENAME_PATTERNS:
        if re.search(pat, fn, re.IGNORECASE):
            return True
    return False


def auto_attach_po_document(communication, order):
    """Copy a PO-looking attachment from the inbound email onto the order.

    Picks the first CommunicationAttachment whose filename matches a PO
    keyword (e.g. ``PO_12345.pdf``, ``Purchase Order.docx``). If nothing
    matches by name but exactly one document attachment exists, use it.
    The file is stored in two places:

    1. ``Order.po_document`` — used by the PO Received gate.
    2. A new ``OrderDocument`` row with ``doc_type='po'`` so it appears
       in the order's Documents tab.

    Idempotent — never overwrites an existing po_document, and skips
    creating a duplicate OrderDocument with the same filename.
    """
    if not communication or not order:
        return False
    if order.po_document:
        return False
    try:
        from django.core.files.base import ContentFile
        from orders.models import OrderDocument
        atts = list(communication.attachments.all())
        if not atts:
            return False
        match = next((a for a in atts if _filename_matches_po(a.filename)), None)
        if not match:
            doc_atts = [a for a in atts if (a.filename or '').lower().endswith(PO_DOC_EXTS)]
            if len(doc_atts) == 1:
                match = doc_atts[0]
        if not match or not match.file:
            return False
        try:
            match.file.open('rb')
            blob = match.file.read()
            match.file.close()
        except Exception:
            return False

        filename = match.filename or 'PO.pdf'

        # 1. Order.po_document (gate)
        order.po_document.save(filename, ContentFile(blob), save=True)

        # 2. OrderDocument row so it appears in the Documents tab
        already = OrderDocument.objects.filter(
            order=order, doc_type='po', name=filename, is_deleted=False,
        ).exists()
        if not already:
            try:
                doc = OrderDocument(
                    order=order, doc_type='po', name=filename,
                    uploaded_by=getattr(communication, 'user', None),
                )
                doc.file.save(filename, ContentFile(blob), save=True)
            except Exception as e:
                logger.warning(f'OrderDocument creation failed for {order.order_number}: {e}')

        # Stamp PO number from filename if we can extract one (e.g. PO-12345)
        po_no_match = re.search(r'PO[\s_-]*([A-Z0-9-]{3,})', filename, re.IGNORECASE)
        if po_no_match and not order.po_number:
            order.po_number = po_no_match.group(1)[:100]
            order.save(update_fields=['po_number'])
        logger.info(
            f'Auto-attached PO document "{filename}" to order '
            f'{order.order_number} from communication {communication.id}'
        )
        return True
    except Exception as e:
        logger.warning(f'auto_attach_po_document failed for {order.order_number}: {e}')
        return False

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
        # Anchor email threading on the original inquiry (preferred) or the
        # PO email itself, so order-stage replies thread back into the same
        # conversation the customer started.
        source_communication=getattr(sent_pi, 'source_communication', None) or communication,
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

    # Auto-attach the PO document from the email if one was attached.
    auto_attach_po_document(communication, order)

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


_HTML_TAG_RE = re.compile(r'<[^>]+>')

UNIT_NORMALIZE = {
    'ton': 'MT', 'tons': 'MT', 'mt': 'MT',
    'kgs': 'KG', 'kg': 'KG',
    'nos': 'PCS', 'pcs': 'PCS', 'pieces': 'PCS',
    'bags': 'BAGS', 'drums': 'DRUMS',
    'litre': 'L', 'litres': 'L', 'liter': 'L', 'liters': 'L',
    'ltr': 'L', 'ltrs': 'L', 'l': 'L',
    'gallon': 'GAL', 'gallons': 'GAL', 'gal': 'GAL',
}
_UNIT_TOKEN_RE = (
    r'(?:MT|KG|KGS|LTR|LTRS|LITRE|LITRES|LITER|LITERS|GAL|GALLONS?|'
    r'NOS|PCS|PIECES|BAGS|DRUMS|TONS?|L)'
)


def _strip_html(s):
    return _HTML_TAG_RE.sub(' ', s or '')


# Words that look like part of a product name but are actually filler
# coming from PO email phrasing. Used to filter the trailing-words fallback.
_STOPWORDS = {
    'po', 'p.o', 'p.o.', 'order', 'purchase', 'reference', 'kindly',
    'please', 'find', 'attached', 'attach', 'attachment', 'enclosed',
    'for', 'your', 'our', 'the', 'a', 'an', 'send', 'us', 'me', 'we',
    'confirm', 'confirmed', 'confirming', 'confirmation', 'place',
    'placed', 'review', 'proceed', 'proforma', 'invoice', 'pi',
    'quotation', 'quote', 'and', 'with', 'regarding', 're', 'fwd',
    'subject', 'product', 'request', 'requested', 'further', 'as',
    'is', 'are', 'will', 'would', 'shall', 'can', 'could',
    'team', 'sir', 'madam', 'hi', 'hello', 'thanks', 'regards',
    'mt', 'kg', 'kgs', 'ltr', 'ltrs', 'litre', 'litres', 'liter',
    'liters', 'gal', 'gallon', 'gallons', 'nos', 'pcs', 'pieces',
    'bags', 'drums', 'tons', 'l', 'tbd',
}

# Phrases that typically precede a product name in a PO email.
_TRIGGER_PHRASES = [
    r'(?:PO|P\.?O\.?|purchase\s+order)\s+for(?:\s+(?:your\s+)?reference)?',
    r'order\s+for(?:\s+(?:your\s+)?reference)?',
    r'(?:place|placing|placed)\s+(?:the\s+)?(?:order|PO)\s+for',
    r'for\s+your\s+reference',
    r'for\s+reference',
    r'regarding',
    r'(?:of|for)',  # weakest — only fires if other phrases didn't
]

# Capture group for 1–2 product-name tokens (alphanumeric, may include % or -).
# Use horizontal whitespace between tokens so we don't accidentally cross a
# newline and pick up the next sentence's first word.
_NAME_TOKEN = r'[A-Za-z][A-Za-z0-9%\-]*'
_PRODUCT_GROUP = rf'({_NAME_TOKEN}(?:[ \t]+{_NAME_TOKEN})?)'


def _clean_token(t):
    return (t or '').strip().rstrip('.,;:!?').strip()


def _is_stopword(t):
    return _clean_token(t).lower() in _STOPWORDS


def _trim_to_product(name):
    """Return at most the first 2 non-stopword tokens of ``name``.

    Drops trailing punctuation/quantities and anything that is clearly
    not part of the product label (units, "TBD", numeric tokens).
    """
    if not name:
        return ''
    cleaned = _clean_token(name)
    cleaned = re.sub(r'\s+', ' ', cleaned)
    tokens = [t for t in cleaned.split(' ') if t]
    out = []
    for t in tokens:
        bare = _clean_token(t)
        if not bare:
            continue
        # stop on numbers (they're quantities) or stopwords
        if re.fullmatch(r'\d+[\.,]?\d*', bare):
            break
        if _is_stopword(bare):
            # keep going only if we already have something
            if out:
                break
            else:
                continue
        out.append(bare)
        if len(out) >= 2:
            break
    return ' '.join(out)


def _resolve_product_from_text(text, subject=''):
    """Find the best product match for an inbound email.

    Strategy (best-first):
    1. ``Product: <name>`` field-style line on the body — clamped to 2 words.
    2. Any product in the catalog whose name appears in the body or subject
       (case-insensitive, longest first to prefer "Neem Oil 3%" over "Neem Oil").
    3. Trigger phrase like "PO for X", "for your reference X", "order for X" in
       the body or subject — captures the next 1–2 capitalized tokens.
    4. Last 1–2 capitalized non-stopword tokens of the subject line.

    Returns ``(product_obj, product_name)``. ``product_name`` is always a
    short label (max 2 words).
    """
    from products.models import Product

    plain = _strip_html(text)
    subj = _strip_html(subject or '')
    haystack = '\n'.join([s for s in (subj, plain) if s])
    if not haystack:
        return None, ''

    # 1. Field-style "Product: xxx" — body only
    m = re.search(
        r'Product\s*(?:Name)?\s*:\s*(.+?)(?=\s*(?:Quantity|Qty|Specification|Concentration|'
        r'Price|Amount|Total|Delivery|Payment|Please|\n|$))',
        plain, re.IGNORECASE,
    )
    if m:
        candidate = _trim_to_product(m.group(1))
        if candidate:
            prod = Product.objects.filter(
                is_deleted=False, is_active=True, name__iexact=candidate,
            ).first()
            return prod, candidate

    # 2. Catalog substring match — body OR subject. Longest first.
    catalog = list(
        Product.objects.filter(is_deleted=False, is_active=True)
        .only('id', 'name', 'concentration', 'base_price')
    )
    catalog.sort(key=lambda p: len(p.name or ''), reverse=True)
    haystack_lower = haystack.lower()
    for p in catalog:
        nm = (p.name or '').strip()
        if not nm:
            continue
        pat = r'(?<![A-Za-z0-9])' + re.escape(nm.lower()) + r'(?![A-Za-z0-9])'
        if re.search(pat, haystack_lower):
            return p, nm

    # 3. Trigger phrase match — try each phrase in order, body+subject.
    # Use horizontal whitespace between trigger and product so we never
    # capture a token from the next line.
    for phrase in _TRIGGER_PHRASES:
        rx = rf'(?:^|[^A-Za-z0-9]){phrase}[ \t]+{_PRODUCT_GROUP}'
        m = re.search(rx, haystack, re.IGNORECASE)
        if m:
            cand = _trim_to_product(m.group(1))
            if cand and not _is_stopword(cand):
                return None, cand

    # 4. Trailing words of subject. Walk from the right keeping capitalised /
    # alphanumeric non-stopword tokens, max 2.
    if subj:
        toks = re.findall(r'[A-Za-z][A-Za-z0-9%\-]*', subj)
        picked = []
        for tok in reversed(toks):
            if _is_stopword(tok):
                if picked:
                    break
                continue
            picked.append(tok)
            if len(picked) >= 2:
                break
        picked.reverse()
        if picked:
            cand = ' '.join(picked)
            if cand:
                return None, cand

    return None, ''


def _resolve_quantity_from_text(text):
    """Extract a quantity + unit pair from the email. Returns ``(qty, unit)``;
    ``qty`` is ``0`` and ``unit`` is ``'KG'`` if nothing is matched."""
    if not text:
        return 0, 'KG'
    plain = _strip_html(text)

    # Field-style "Quantity: 30 MT"
    m = re.search(
        rf'(?:Quantity|Qty)\s*:?\s*(\d+[\.,]?\d*)\s*({_UNIT_TOKEN_RE})?',
        plain, re.IGNORECASE,
    )
    if not m:
        # Free-form: "30 MT", "5 LTR", etc.
        m = re.search(rf'(\d+[\.,]?\d*)\s*({_UNIT_TOKEN_RE})\b', plain, re.IGNORECASE)
    if not m:
        return 0, 'KG'
    try:
        qty = float(m.group(1).replace(',', '.'))
    except (TypeError, ValueError):
        qty = 0
    raw_unit = (m.group(2) or 'KG').lower()
    return qty, UNIT_NORMALIZE.get(raw_unit, raw_unit.upper())


def _create_direct_order(communication, client, text):
    """Create a direct order from email content when no PI is available.
    Extracts product (from the catalog when possible), quantity, unit and
    price from the email body."""
    from orders.models import Order, OrderItem
    from products.models import Product  # noqa: F401  (used by helper)

    # 1. Resolve product from the email — pass subject so the extractor can
    # look in both the body and the subject line.
    product_obj, product_name = _resolve_product_from_text(
        text, subject=getattr(communication, 'subject', '') or '',
    )

    # 2. Resolve quantity / unit
    quantity, unit = _resolve_quantity_from_text(text)

    # 3. Last-ditch fallback. The extractor already mines the subject; only
    # fall through if every strategy failed.
    if not product_name:
        product_name = 'Product from PO email'
    # Hard cap at 2 words (defensive — extractor should already do this).
    product_name = _trim_to_product(product_name) or product_name
    product_name = product_name[:120]

    # 4. Resolve unit price — prefer matched product; fall back to keyword search
    unit_price = 0
    if product_obj is None and product_name:
        try:
            first_token = product_name.split()[0]
            product_obj = Product.objects.filter(
                is_deleted=False, is_active=True, name__icontains=first_token,
            ).first()
        except Exception:
            pass
    if product_obj is not None:
        try:
            unit_price = float(product_obj.base_price or 0)
        except (TypeError, ValueError):
            unit_price = 0

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
        source_communication=communication,
    )

    OrderItem.objects.create(
        order=order,
        product=product_obj,
        product_name=product_name,
        quantity=quantity or 1,
        unit=unit,
        unit_price=unit_price,
        total_price=(quantity or 1) * unit_price,
    )

    # Auto-attach the PO document from the email if one was attached.
    auto_attach_po_document(communication, order)

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
