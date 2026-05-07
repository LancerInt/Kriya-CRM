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
    'subject', 'product', 'products', 'request', 'requested', 'requesting',
    'further', 'as',
    'is', 'are', 'will', 'would', 'shall', 'can', 'could',
    'team', 'sir', 'madam', 'hi', 'hello', 'thanks', 'regards',
    'mt', 'kg', 'kgs', 'ltr', 'ltrs', 'litre', 'litres', 'liter',
    'liters', 'gal', 'gallon', 'gallons', 'nos', 'pcs', 'pieces',
    'bags', 'drums', 'tons', 'l', 'tbd',
    # ── Section/list filler tokens that should never become a product
    'below', 'above', 'following', 'follow', 'follows', 'mentioned',
    'item', 'items', 'list', 'listed', 'detail', 'details',
    'this', 'that', 'these', 'those', 'them', 'it',
    'in', 'on', 'at', 'to', 'from', 'by', 'of',
    'need', 'needs', 'require', 'requires', 'required', 'interested',
    'noted', 'note', 'notes',
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
            # Reject hard non-products too — protects against
            # "request for the below" → "below" capture.
            if cand and not _is_stopword(cand) and cand.lower() not in _HARD_NON_PRODUCT:
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


# Bullets / numbered list markers that often precede each product name in
# a multi-product PO request. We strip these and read the product off the
# remainder of the line.
_BULLET_LINE_RE = re.compile(r'^\s*(?:[•◦▶▪\-\*]|\d+[\.\)])\s*(.+?)\s*$', re.MULTILINE)

# Phrases that announce a multi-line product list. When any of these are
# found, we stop reading the same line and start collecting products from
# the next non-empty lines until we hit a sentence / signature / blank.
_LIST_TRIGGER_RE = re.compile(
    r'(?:'
    r'below\s+products?|'
    r'following\s+products?|'
    r'(?:^|\W)products?\s*:|'
    r'(?:^|\W)items?\s*:|'
    r'product\s+list|'
    r'required\s+products?|'
    r'our\s+requirement|'
    r'product\s+requirements?|'
    r'we\s+(?:require|need|are\s+interested\s+in)|'
    r'interested\s+in\s+sourcing|'
    r'sourcing\s+(?:the\s+)?(?:following|below)?\s*products?|'
    r'(?:purchase\s+)?(?:order\s+)?request\s+for|'
    r'(?:request\s+for\s+)?quotation\s+for|'
    r'(?:please\s+)?(?:kindly\s+)?(?:share|send)\s+(?:your\s+)?quote\s+for|'
    r'(?:please\s+)?(?:kindly\s+)?quote\s+for|'
    r'inquiry\s+for'
    r')',
    re.IGNORECASE | re.MULTILINE,
)

# Quantity + UOM patterns inside a single product line.
# UOM tokens are matched as whole words and normalized to uppercase.
_UOM_TOKENS = (
    'MT', 'TON', 'TONS', 'TONNES', 'KG', 'KGS', 'GM', 'G',
    'LTR', 'LTRS', 'LT', 'LITRE', 'LITRES', 'LITER', 'LITERS',
    'L', 'ML', 'NOS', 'PCS', 'BAG', 'BAGS', 'DRUM', 'DRUMS',
    'IBC', 'CONTAINER', 'CONTAINERS',
)
_UOM_ALT = '|'.join(re.escape(u) for u in _UOM_TOKENS)
# A number followed by a UOM. Concentrations like "0.3%" / "90%" must NOT
# match because they're glued to the percent sign instead of a UOM.
_QTY_UOM_RE = re.compile(
    rf'(\d+(?:\.\d+)?)\s*({_UOM_ALT})\b',
    re.IGNORECASE,
)
_QTY_LABEL_RE = re.compile(
    rf'(?:Qty|Quantity)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*({_UOM_ALT})?\b',
    re.IGNORECASE,
)


def _split_qty_from_line(line):
    """Extract (clean_product_name, qty, uom) from a single product line.
    Concentration tokens (`0.3%`, `90%`) stay in the product name; only a
    bare number followed by a UOM token is treated as the quantity.
    Returns qty=0 and uom='' when nothing is found."""
    s = (line or '').strip()
    if not s:
        return s, 0, ''
    qty = 0
    uom = ''
    # Prefer "Qty: 30 MT" / "Quantity: 30" patterns
    m = _QTY_LABEL_RE.search(s)
    if m:
        try:
            qty = float(m.group(1))
        except (TypeError, ValueError):
            qty = 0
        uom = (m.group(2) or '').upper()
        s = (s[:m.start()] + s[m.end():]).strip()
    else:
        m = _QTY_UOM_RE.search(s)
        if m:
            try:
                qty = float(m.group(1))
            except (TypeError, ValueError):
                qty = 0
            uom = (m.group(2) or '').upper()
            # Strip the qty+uom out of the product label.
            s = (s[:m.start()] + s[m.end():])
    # Tidy separators left behind ("Neem Oil 0.3% - " / " | ")
    s = re.sub(r'\s*[-–—|,:]\s*$', '', s).strip()
    s = re.sub(r'^\s*[-–—|,:]\s*', '', s).strip()
    return s, qty, uom

# Words that should NEVER be returned as a product name even if the
# extractor's regex captured them. Hard guard against the trigger words
# themselves bleeding through (e.g. "request for" capturing "below").
_HARD_NON_PRODUCT = {
    'below', 'above', 'following', 'follow', 'mentioned', 'product',
    'products', 'item', 'items', 'list', 'request', 'order', 'po',
    'reference', 'detail', 'details',
}


# Lines that signal we should stop reading the trailing product list.
_STOP_LINE_RE = re.compile(
    r'^\s*(?:'
    r'kindly|please|thanks|regards|best\s+regards|warm\s+regards|'
    r'sincerely|cheers|looking\s+forward|let\s+us\s+know|'
    r'we\s+(?:will|shall|hope|are\s+looking)|'
    r'awaiting|hoping|hope\s+'
    r')',
    re.IGNORECASE,
)


def _strip_trailing_qty(s):
    """Drop a trailing quantity expression like ' - 30 KG' or ': 5 LTR'."""
    if not s:
        return s
    s = re.sub(rf'\s*[-—–:,]?\s*\d+[\.,]?\d*\s*({_UNIT_TOKEN_RE})\s*$', '', s, flags=re.IGNORECASE)
    return s.strip()


def _resolve_all_products_from_text(text, subject=''):
    """Return a list of dicts (one per detected product) with keys
    ``product`` (Product instance or None), ``name`` (short label), and a
    derived ``unit_price`` from the catalog if matched.

    Strategy:
      1. Bullet/numbered list — extract every line, match catalog where
         possible, trim the rest to a 2-word product label.
      2. If no bullets matched, scan the body+subject for ALL catalog
         products (longest-name first) to support comma-separated PO
         requests like "PO for Neem Oil, Humic Acid".
      3. Last resort — fall back to the single-product extractor so a
         lonely product still gets picked up.
    """
    from products.models import Product

    plain = _strip_html(text)
    subj = _strip_html(subject or '')
    haystack = '\n'.join([s for s in (subj, plain) if s])
    if not haystack:
        return []

    catalog = list(
        Product.objects.filter(is_deleted=False, is_active=True)
        .only('id', 'name', 'concentration', 'base_price')
    )
    catalog.sort(key=lambda p: len(p.name or ''), reverse=True)

    def _match_catalog(line):
        low = line.lower()
        for p in catalog:
            nm = (p.name or '').lower().strip()
            if not nm:
                continue
            if re.search(r'(?<![A-Za-z0-9])' + re.escape(nm) + r'(?![A-Za-z0-9])', low):
                return p
        return None

    results = []
    seen = set()

    def _push(prod, name, qty=0, uom=''):
        # When a catalog product matched, trust that name unless the
        # original line carries extra info (e.g. catalog has "Neem Oil"
        # but the email said "Neem Oil 0.3%" — keep the longer label).
        if prod is not None:
            candidate = (name or '').strip()
            cat_name = (prod.name or '').strip()
            if candidate and len(candidate) > len(cat_name) and cat_name.lower() in candidate.lower():
                cleaned = candidate[:120]
            else:
                cleaned = cat_name
        else:
            # Don't trim to 2 words for catalog-less names — products like
            # "Neem Oil 0.3%" are valid 3-token labels. Just clean filler.
            cleaned = _clean_token(name)
            words = [w for w in re.split(r'\s+', cleaned) if w]
            if not words:
                return
            if all(
                _clean_token(w).lower() in _STOPWORDS
                or _clean_token(w).lower() in _HARD_NON_PRODUCT
                for w in words
            ):
                return
        if not cleaned:
            return
        # Hard guard — never accept the trigger filler ("below", "following",
        # "products", etc.) as a product name even if the regex captured it.
        if cleaned.lower() in _HARD_NON_PRODUCT:
            return
        # Drop very short stray tokens with no catalog backing.
        if len(cleaned) < 2 and not prod:
            return
        key = cleaned.lower()
        if key in seen:
            return
        seen.add(key)
        unit_price = 0
        if prod is not None:
            try:
                unit_price = float(prod.base_price or 0)
            except (TypeError, ValueError):
                unit_price = 0
        results.append({
            'product': prod,
            'name': cleaned[:120],
            'unit_price': unit_price,
            'quantity': qty,
            'uom': uom,
        })

    # Strategy 0 (highest priority): a sentence containing a list-trigger
    # phrase like "request for the below products:" — read products from
    # the SUBSEQUENT lines, never from the same line. This stops "below"
    # from being captured by the weaker generic trigger phrases below.
    plain_lines = plain.split('\n')
    trigger_idx = None
    for i, line in enumerate(plain_lines):
        if _LIST_TRIGGER_RE.search(line):
            trigger_idx = i
            break
    if trigger_idx is not None:
        # Some PO emails put the products on the SAME line as the trigger,
        # after a colon: "below products: MargoShine, OrgoCare". Parse
        # those inline products first.
        trigger_line = plain_lines[trigger_idx]
        m_inline = re.search(r':\s*(.+)$', trigger_line)
        if m_inline:
            tail = m_inline.group(1).strip()
            # Drop common closers if the same line ends with a sentence.
            if tail and not _STOP_LINE_RE.match(tail):
                # Split on commas / "and" / semicolons.
                for part in re.split(r'\s*(?:,|;|\band\b|\bor\b|/)\s*', tail, flags=re.IGNORECASE):
                    label, qty, uom = _split_qty_from_line(part)
                    if label and label.lower() not in _HARD_NON_PRODUCT:
                        prod = _match_catalog(label)
                        _push(prod, label, qty=qty, uom=uom)
        # Walk forward, collecting non-empty, non-stopword lines until we
        # hit a blank line, a signature/sentence opener, or 12 lines max.
        for raw in plain_lines[trigger_idx + 1: trigger_idx + 13]:
            line = raw.strip()
            # Strip a leading bullet/number marker if present.
            mb = re.match(r'^[\s•◦▶▪\-\*]*(?:\d+[\.\)])?\s*(.+?)\s*$', line)
            if mb:
                line = mb.group(1)
            if not line:
                # Blank line = end of list (only honour it AFTER we've
                # already pushed at least one product).
                if results:
                    break
                continue
            if _STOP_LINE_RE.search(line):
                break
            # Skip filler lines that are obviously not a product.
            if line.lower() in _HARD_NON_PRODUCT:
                continue
            # Some emails put a SECOND trigger on this line followed by
            # the product list inline ("below products: A, B"). When we
            # spot a trigger phrase on the line, drop everything up to
            # the colon and split the rest on commas.
            if _LIST_TRIGGER_RE.search(line):
                m_in = re.search(r':\s*(.+)$', line)
                if m_in:
                    tail = m_in.group(1).strip()
                    if tail:
                        for part in re.split(r'\s*(?:,|;|\band\b|\bor\b|/)\s*', tail, flags=re.IGNORECASE):
                            lab, q, u = _split_qty_from_line(part)
                            if lab and lab.lower() not in _HARD_NON_PRODUCT:
                                _push(_match_catalog(lab), lab, qty=q, uom=u)
                continue
            # Comma-separated inline list on a normal line ("Margoshine,
            # OrgoCare, Neem Oil"). Split first; if any part looks like a
            # standalone product, push it; otherwise treat the whole line
            # as one product.
            comma_parts = [p.strip() for p in re.split(r'\s*(?:,|;|\band\b)\s*', line, flags=re.IGNORECASE) if p.strip()]
            if len(comma_parts) > 1 and all(len(p.split()) <= 4 for p in comma_parts):
                for part in comma_parts:
                    lab, q, u = _split_qty_from_line(part)
                    if lab and lab.lower() not in _HARD_NON_PRODUCT:
                        _push(_match_catalog(lab), lab, qty=q, uom=u)
                continue
            # Split out per-line qty+uom; the rest is the product label.
            label, qty, uom = _split_qty_from_line(line)
            if not label:
                continue
            prod = _match_catalog(label)
            _push(prod, label, qty=qty, uom=uom)

    # Strategy 1: bullets / numbered list lines (only triggers when the
    # trigger-phrase strategy didn't pick anything up).
    if not results:
        for m in _BULLET_LINE_RE.finditer(plain):
            line = m.group(1).strip()
            if not line:
                continue
            # Skip headings / instructions, not product lines.
            if re.search(r'(please|kindly|update|status|expected|dispatch|timeline|regards|reference)', line, re.IGNORECASE):
                continue
            label, qty, uom = _split_qty_from_line(line)
            if not label:
                continue
            prod = _match_catalog(label)
            _push(prod, label, qty=qty, uom=uom)

    # Strategy 2: catalog scan — covers comma-separated PO lines.
    if not results:
        for p in catalog:
            nm = (p.name or '').lower().strip()
            if not nm:
                continue
            if re.search(r'(?<![A-Za-z0-9])' + re.escape(nm) + r'(?![A-Za-z0-9])', haystack.lower()):
                _push(p, p.name)

    # Strategy 3: fall back to the single-product resolver.
    if not results:
        prod, name = _resolve_product_from_text(text, subject)
        if name or prod:
            _push(prod, prod.name if prod else name)

    return results


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

    # 1. Resolve EVERY product mentioned in the email so a multi-product PO
    # turns into multiple line items, not just one.
    subject = getattr(communication, 'subject', '') or ''
    products = _resolve_all_products_from_text(text, subject=subject)

    # 2. Resolve quantity / unit at the email level (used as a fallback
    # only when a row didn't carry its own qty/uom — never overrides a
    # row that already has one).
    fallback_qty, fallback_unit = _resolve_quantity_from_text(text)

    if not products:
        # Could not confidently extract anything — leave the order empty
        # so the executive sees a blank Line Items table and adds rows
        # manually instead of inheriting a bogus "below / 1 KG" entry.
        products = []

    # Defensive — keep label clean but don't aggressively trim, so labels
    # like "Neem Oil 0.3%" survive intact.
    for entry in products:
        nm = (entry.get('name') or '').strip()
        entry['name'] = nm[:120] if nm else 'Product from PO email'

    grand_total = 0
    for entry in products:
        # Per-row qty falls back to email-level qty only if missing on the row.
        qty_for_row = entry.get('quantity') or 0
        if not qty_for_row and fallback_qty:
            qty_for_row = fallback_qty
        unit_for_row = entry.get('uom') or fallback_unit or 'KG'
        unit_price = float(entry.get('unit_price') or 0)
        entry['_qty'] = qty_for_row
        entry['_unit'] = unit_for_row
        entry['_total'] = (qty_for_row or 0) * unit_price
        grand_total += entry['_total']

    order_count = Order.objects.count() + 1
    order = Order.objects.create(
        order_number=f'ORD-{order_count:05d}',
        client=client,
        order_type='direct',
        status='confirmed',
        currency=client.preferred_currency or 'USD',
        total=grand_total,
        notes=f'Auto-created from PO email: {communication.subject or ""}',
        created_by=communication.user,
        source_communication=communication,
    )

    for entry in products:
        OrderItem.objects.create(
            order=order,
            product=entry.get('product'),
            product_name=entry.get('name'),
            # Leave qty at 0 (NOT default 1) when the email never said a number.
            quantity=entry.get('_qty') or 0,
            unit=entry.get('_unit') or 'KG',
            unit_price=entry.get('unit_price') or 0,
            total_price=entry.get('_total') or 0,
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

    logger.info(
        f'Direct order {order.order_number} created from PO email for {client.company_name} — '
        f'products: {", ".join(p["name"] for p in products)}'
    )
    return order
