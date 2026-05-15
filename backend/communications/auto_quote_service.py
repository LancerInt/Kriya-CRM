"""
Auto Quote Service — orchestrates the full workflow from incoming message to draft quotation.

Flow:
1. Receive communication (email/WhatsApp)
2. Detect quote intent (AI or rule-based)
3. Extract structured fields
4. Match or create client
5. Create QuoteRequest record
6. Generate draft Quotation
7. Notify assigned executive
"""
import logging
from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)


def _find_thread_communication_ids(communication):
    """Find all Communication IDs in the same email thread as the given communication.
    Uses ONLY email_message_id / email_in_reply_to chains — no subject matching."""
    from .models import Communication
    from django.db.models import Q

    if not communication.comm_type == 'email':
        return []

    message_ids = set()
    if communication.email_message_id:
        message_ids.add(communication.email_message_id)
    if communication.email_in_reply_to:
        message_ids.add(communication.email_in_reply_to)

    if not message_ids:
        return []

    filters = (
        Q(email_message_id__in=message_ids) |
        Q(email_in_reply_to__in=message_ids)
    )
    if communication.email_message_id:
        filters |= Q(email_in_reply_to=communication.email_message_id)

    related = Communication.objects.filter(
        filters, is_deleted=False, comm_type='email',
    ).exclude(id=communication.id).values_list('id', flat=True)

    return list(related)


def process_communication_for_quote(communication, force=False):
    """
    Main entry point — process an incoming communication for auto-quote generation.

    When ``force=True`` the AI intent check is bypassed and a QuoteRequest is
    created regardless of the detector's verdict. This is used by the manual
    backfill command and the in-app "Save to Quotations" button so the user can
    override the AI when they know the email is a quote request.

    Returns QuoteRequest if created, None otherwise.
    """
    from .models import QuoteRequest
    from .backfill_guard import is_historical_communication

    # Historical / backfilled email — storage only, no automation. The manual
    # "Save to Quotations" button passes force=True so the user can still pull
    # an old email into Quotations explicitly when they need to.
    if not force and is_historical_communication(communication):
        return None

    # Skip if already processed
    if hasattr(communication, 'quote_request'):
        try:
            communication.quote_request
            return None  # Already has a quote request
        except QuoteRequest.DoesNotExist:
            pass

    # Skip outbound messages
    if communication.direction != 'inbound':
        return None

    # Skip if a QuoteRequest already exists in the same email thread
    # (prevents duplicate inquiry cards for follow-up emails in the same thread)
    if communication.comm_type == 'email':
        from .models import Communication
        from django.db.models import Q
        thread_comm_ids = _find_thread_communication_ids(communication)
        if thread_comm_ids:
            existing_qr = QuoteRequest.objects.filter(
                source_communication_id__in=thread_comm_ids,
                is_deleted=False,
            ).first()
            if existing_qr:
                logger.info(f'Skipping comm {communication.id} — QuoteRequest {existing_qr.id} already exists in same thread')
                return None

    # Get message text
    text = _get_message_text(communication)
    if not text or len(text.strip()) < 10:
        return None

    # Step 1: Detect quote intent (skipped when force=True)
    if force:
        is_quote, confidence = True, 1.0
        logger.info(f'Forced quote creation for comm {communication.id} (intent check bypassed)')
    else:
        from .quote_request_parser import detect_intent_with_ai
        is_quote, confidence = detect_intent_with_ai(text)

    # Update communication with detected intent
    communication.ai_extracted_intent = 'quote_request' if is_quote else 'general'
    communication.save(update_fields=['ai_extracted_intent'])

    if not is_quote:
        return None

    logger.info(f'Quote intent detected (confidence={confidence}) for comm {communication.id}')

    # Step 2: Extract structured fields
    from .quote_request_parser import extract_with_ai
    fields = extract_with_ai(text)

    # Step 3: Match or create client
    client, contact, auto_created = _match_or_create_client(communication)

    # Step 4: Determine sender info
    sender_name = ''
    sender_email = communication.external_email or ''
    sender_phone = communication.external_phone or ''
    if contact:
        sender_name = contact.name
    elif client:
        sender_name = client.company_name

    # Step 5: Assign to executive
    assigned_to = _get_assigned_executive(client, communication)

    # Step 6: Create QuoteRequest
    qr = QuoteRequest.objects.create(
        source_communication=communication,
        source_channel=communication.comm_type,
        client=client,
        contact=contact,
        sender_name=sender_name,
        sender_email=sender_email,
        sender_phone=sender_phone,
        client_auto_created=auto_created,
        assigned_to=assigned_to,
        ai_confidence=confidence,
        extracted_product=fields.get('product', ''),
        extracted_quantity=fields.get('quantity', ''),
        extracted_unit=fields.get('unit', 'MT'),
        extracted_packaging=fields.get('packaging', ''),
        extracted_destination_country=fields.get('destination_country', ''),
        extracted_destination_port=fields.get('destination_port', ''),
        extracted_delivery_terms=fields.get('delivery_terms', ''),
        extracted_payment_terms=fields.get('payment_terms', ''),
        extracted_notes=fields.get('notes', ''),
    )

    # Step 7: Auto-generate draft quotation if we have enough data
    if fields.get('product') and client:
        try:
            quotation = _generate_draft_quotation(qr)
            qr.linked_quotation = quotation
            qr.save(update_fields=['linked_quotation'])
        except Exception as e:
            logger.error(f'Failed to auto-generate quotation for QR {qr.id}: {e}')

    # Step 8: Create notification
    _notify_executive(qr, assigned_to)

    logger.info(f'QuoteRequest {qr.id} created from {communication.comm_type} communication {communication.id}')
    return qr


def _get_message_text(communication):
    """Extract plain text from communication body."""
    import re
    body = communication.body or ''
    # Strip HTML tags
    text = re.sub(r'<[^>]+>', ' ', body)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    # Prepend subject for better context
    if communication.subject:
        text = f"{communication.subject}\n{text}"
    return text


def _match_or_create_client(communication):
    """
    Match communication to existing client/contact, or create new client lead.
    Returns: (client, contact, auto_created)
    """
    from .services import ContactMatcher
    from clients.models import Client

    client = communication.client
    contact = communication.contact
    auto_created = False

    # Already matched
    if client:
        return client, contact, False

    # Try matching by email
    if communication.external_email:
        client, contact = ContactMatcher.match_by_email(communication.external_email)

    # Try matching by phone
    if not client and communication.external_phone:
        client, contact = ContactMatcher.match_by_phone(communication.external_phone)

    # If still no client, create a new lead
    if not client:
        sender = communication.external_email or communication.external_phone or 'Unknown'
        # Extract company name from email domain
        company_name = sender
        free_providers = ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
                          'live.com', 'aol.com', 'icloud.com', 'mail.com')
        if '@' in sender:
            domain = sender.split('@')[1].lower()
            if domain in free_providers:
                # Use the local part as name for free email providers
                local = sender.split('@')[0]
                company_name = local.replace('.', ' ').replace('_', ' ').replace('-', ' ').title()
            else:
                company_name = domain.split('.')[0].title() + ' (Auto-created)'

        client = Client.objects.create(
            company_name=company_name,
            phone_number=communication.external_phone or '',
            status='prospect',
            notes=f'Auto-created from {communication.comm_type} quote request',
        )
        auto_created = True

        # Create contact if we have details
        if communication.external_email or communication.external_phone:
            from clients.models import Contact
            contact_name = company_name
            if '@' in sender:
                local = sender.split('@')[0]
                contact_name = local.replace('.', ' ').replace('_', ' ').replace('-', ' ').title()
            contact = Contact.objects.create(
                client=client,
                name=contact_name,
                email=communication.external_email or '',
                phone=communication.external_phone or '',
                is_primary=True,
            )

    # Update communication with matched client
    if client and not communication.client:
        communication.client = client
        communication.contact = contact
        communication.save(update_fields=['client', 'contact'])

    return client, contact, auto_created


def _get_assigned_executive(client, communication):
    """Determine which executive to assign the quote request to."""
    # Use client's primary executive
    if client and client.primary_executive:
        return client.primary_executive

    # Use the email account owner
    if communication.user:
        return communication.user

    # Fallback: first admin user
    from accounts.models import User
    return User.objects.filter(role__in=['admin', 'manager']).first()


def _generate_draft_quotation(quote_request):
    """Generate a draft Quotation from a QuoteRequest."""
    from quotations.models import Quotation, QuotationItem, generate_quotation_number

    qr = quote_request

    # Determine delivery terms
    delivery_terms = 'FOB'
    if qr.extracted_delivery_terms:
        valid_terms = dict(Quotation.DELIVERY_CHOICES)
        if qr.extracted_delivery_terms in valid_terms:
            delivery_terms = qr.extracted_delivery_terms

    # Create quotation
    quotation = Quotation.objects.create(
        quotation_number=generate_quotation_number(),
        client=qr.client,
        currency='USD',
        delivery_terms=delivery_terms,
        country_of_origin='India',
        country_of_final_destination=qr.extracted_destination_country or '',
        port_of_discharge=qr.extracted_destination_port or '',
        notes=f'Auto-generated from {qr.source_channel} quote request.\n{qr.extracted_notes}',
        created_by=qr.assigned_to,
    )

    # Create line item
    qty = 0
    try:
        qty = float(qr.extracted_quantity) if qr.extracted_quantity else 0
    except (ValueError, TypeError):
        pass

    # Match extracted product name to Product master — auto-create if missing
    client_product_name = qr.extracted_product or 'Product TBD'
    company_product_name = client_product_name
    matched_product = None

    if qr.extracted_product:
        matched_product, _created = _match_or_create_product(qr.extracted_product)
        if matched_product:
            company_product_name = str(matched_product)  # includes concentration

    # Get client-specific price, fallback to product base price
    unit_price = _get_client_price(qr.client, matched_product)
    QuotationItem.objects.create(
        quotation=quotation,
        product=matched_product,
        product_name=company_product_name,
        client_product_name=client_product_name,
        description=qr.extracted_packaging or '',
        quantity=qty,
        unit=qr.extracted_unit or 'MT',
        unit_price=unit_price,
        total_price=qty * unit_price,
    )

    return quotation


def resolve_line_items_from_email(client, communication):
    """Multi-product variant of resolve_line_item_from_email.

    Returns a LIST of line-item dicts (same shape as the single version).
    Used by the Sample flow because clients often request multiple products
    in one email — e.g. "send me a sample of Neem Oil and Karanja Oil".

    Detection strategy:
        1. Run a dedicated AI call asking for an array of products with names
           and quantities.
        2. For each extracted product, run it through _match_or_create_product
           and the same client price-list lookup as the single-line resolver.
        3. If the AI returns nothing useful, fall back to the single-line
           resolver and wrap its result in a one-element list.
    """
    import re as _re
    import json as _json

    if not communication:
        return []

    text = (communication.subject or '') + '\n' + (communication.body or '')
    text = _re.sub(r'<[^>]+>', ' ', text).strip()

    # Try a dedicated multi-product extraction first
    products_extracted = []
    try:
        from agents.models import AIConfig
        from common.encryption import decrypt_value
        config = AIConfig.objects.filter(is_active=True).first()
        if config:
            api_key = decrypt_value(config.api_key)
            prompt = (
                'Extract every distinct product the client mentions in this email. '
                'Return ONLY a JSON array, no explanation. Each item must have "product" '
                '(the product name as the client wrote it, e.g. "Neem Oil 0.3%") and '
                '"quantity" (e.g. "5 KG", "2 LTR", or "" if not mentioned). If only one '
                'product is mentioned, return an array with one item.\n\n'
                f'Email:\n{text[:2000]}\n\nJSON array:'
            )
            result = ''
            if config.provider == 'groq':
                from groq import Groq
                gclient = Groq(api_key=api_key)
                resp = gclient.chat.completions.create(
                    model=config.model_name or 'llama-3.3-70b-versatile',
                    messages=[{'role': 'user', 'content': prompt}],
                    temperature=0.1, max_tokens=500,
                )
                result = resp.choices[0].message.content.strip()
            elif config.provider == 'gemini':
                from google import genai
                gclient = genai.Client(api_key=api_key)
                resp = gclient.models.generate_content(
                    model=config.model_name or 'gemini-2.0-flash',
                    contents=prompt,
                )
                result = resp.text.strip()
            if result:
                if result.startswith('```'):
                    result = _re.sub(r'^```(?:json)?\s*', '', result)
                    result = _re.sub(r'\s*```$', '', result)
                parsed = _json.loads(result)
                if isinstance(parsed, list):
                    for entry in parsed:
                        if isinstance(entry, dict) and entry.get('product'):
                            products_extracted.append({
                                'product': str(entry['product']).strip(),
                                'quantity': str(entry.get('quantity') or '').strip(),
                            })
    except Exception as e:
        logger.warning(f'Multi-product extraction failed: {e}')

    if not products_extracted:
        single = resolve_line_item_from_email(client, communication)
        return [single] if single else []

    # Build a full line dict for each extracted product using the same
    # matching/pricing logic as the single-product resolver
    out_lines = []
    for entry in products_extracted:
        product_text = entry['product']
        qty_text = entry['quantity']
        # Build a synthetic single-line by reusing _match_or_create_product
        # and the price-list lookup chain. We can't call
        # resolve_line_item_from_email directly because it parses the WHOLE
        # email body — we'd lose the per-product mapping.
        line = {
            'product': None,
            'product_name': product_text,
            'client_product_name': product_text,
            'quantity': 0,
            'unit': 'KG',
            'unit_price': 0,
            'currency': (client.preferred_currency if client else 'USD') or 'USD',
            'description': '',
            'destination_country': '',
            'destination_port': '',
            'delivery_terms': '',
        }
        try:
            matched, _was_created = _match_or_create_product(product_text)
            if matched:
                line['product'] = matched
                line['product_name'] = matched.name
                line['unit'] = matched.unit or line['unit']
                if matched.client_brand_names:
                    brands = [b.strip() for b in matched.client_brand_names.split(',') if b.strip()]
                    extracted_lower = product_text.lower()
                    chosen = next(
                        (b for b in brands if b.lower() in extracted_lower or extracted_lower in b.lower()),
                        brands[0] if brands else '',
                    )
                    if chosen:
                        line['client_product_name'] = chosen
                if client:
                    from clients.models import ClientPriceList
                    cp = ClientPriceList.objects.filter(
                        client=client, is_deleted=False
                    ).filter(
                        models.Q(product=matched) | models.Q(product_name__iexact=matched.name)
                    ).first()
                    if cp:
                        line['unit_price'] = float(cp.unit_price)
                        line['currency'] = cp.currency or line['currency']
                        line['unit'] = cp.unit or line['unit']
                        if cp.client_product_name:
                            line['client_product_name'] = cp.client_product_name
                    elif matched.base_price:
                        line['unit_price'] = float(matched.base_price)
                        line['currency'] = matched.currency or line['currency']
        except Exception as e:
            logger.warning(f'Per-product enrichment failed for "{product_text}": {e}')

        # Parse quantity number/unit
        if qty_text:
            m = _re.match(r'\s*([\d,.]+)\s*([a-zA-Z]+)?', qty_text)
            if m:
                try:
                    line['quantity'] = float(m.group(1).replace(',', ''))
                except (ValueError, TypeError):
                    pass
                if m.group(2):
                    line['unit'] = m.group(2).upper()
        out_lines.append(line)

    return out_lines


def resolve_line_item_from_email(client, communication):
    """Run AI extraction over an email and resolve a complete line-item payload.

    Used by both Quotation and Proforma Invoice "create from email" endpoints so
    they share the exact same field-population rules:

    - product/quantity → AI-extracted from the email body+subject
    - Product is auto-created in the Products master if missing
    - product_name (company name) → from Product master (includes concentration)
    - client_product_name → first entry of Product.client_brand_names if set,
      otherwise the raw text the client used in their email
    - unit_price + currency → ClientPriceList for this client first, then the
      Product master base_price as fallback
    - unit → ClientPriceList.unit, then Product.unit, then 'KG'

    Returns a dict with keys: product (Product or None), product_name,
    client_product_name, quantity, unit, unit_price, currency, description,
    destination_country, destination_port, delivery_terms.
    Returns None if there is nothing useful to extract.
    """
    import re as _re
    from .quote_request_parser import extract_with_ai

    if not communication:
        return None

    text = (communication.subject or '') + '\n' + (communication.body or '')
    text = _re.sub(r'<[^>]+>', ' ', text)
    fields = extract_with_ai(text) or {}

    out = {
        'product': None,
        'product_name': '',
        'client_product_name': '',
        'quantity': 0,
        'unit': 'KG',
        'unit_price': 0,
        'currency': (client.preferred_currency if client else 'USD') or 'USD',
        'description': fields.get('packaging', '') or '',
        'destination_country': fields.get('destination_country', '') or '',
        'destination_port': fields.get('destination_port', '') or '',
        'delivery_terms': fields.get('delivery_terms', '') or '',
    }

    extracted_product = (fields.get('product') or '').strip()
    if extracted_product:
        # Default both names to the raw email text — overwritten below if we
        # successfully match against the Product master
        out['product_name'] = extracted_product
        out['client_product_name'] = extracted_product

        matched, _was_created = _match_or_create_product(extracted_product)
        if matched:
            out['product'] = matched
            # Company product name comes straight from Product.name on the
            # Product master page (no concentration suffix).
            out['product_name'] = matched.name
            out['unit'] = matched.unit or out['unit']

            # client_product_name from Product master's client_brand_names list.
            # Prefer the brand that the email actually mentioned; otherwise fall
            # back to the first one in the list.
            if matched.client_brand_names:
                brands = [b.strip() for b in matched.client_brand_names.split(',') if b.strip()]
                extracted_lower = extracted_product.lower()
                chosen = next(
                    (b for b in brands if b.lower() in extracted_lower or extracted_lower in b.lower()),
                    brands[0] if brands else '',
                )
                if chosen:
                    out['client_product_name'] = chosen

            # Price from this client's ClientPriceList — try several lookup
            # strategies because the price list often stores the product under a
            # slightly different name (with/without concentration, brand alias,
            # client's own name, etc.). Falls back to product master base_price.
            if client:
                from clients.models import ClientPriceList
                base_qs = ClientPriceList.objects.filter(client=client, is_deleted=False)

                cp = None
                # 1) FK match
                cp = base_qs.filter(product=matched).first()
                # 2) Exact product_name match (case-insensitive)
                if not cp:
                    cp = base_qs.filter(product_name__iexact=matched.name).first()
                # 3) Match by name + concentration ("Neem Oil 0.3%")
                if not cp and matched.concentration:
                    full_name = f'{matched.name} {matched.concentration}'.strip()
                    cp = base_qs.filter(product_name__iexact=full_name).first()
                    if not cp:
                        cp = base_qs.filter(product_name__icontains=matched.name).filter(
                            product_name__icontains=matched.concentration
                        ).first()
                # 4) Loose contains match on the product name
                if not cp:
                    cp = base_qs.filter(product_name__icontains=matched.name).first()
                # 5) Match by what the client calls it (any of: extracted text,
                #    Product master client_brand_names, ClientPriceList.client_product_name)
                if not cp:
                    cp = base_qs.filter(client_product_name__iexact=extracted_product).first()
                if not cp and matched.client_brand_names:
                    for brand in matched.client_brand_names.split(','):
                        b = brand.strip()
                        if not b:
                            continue
                        cp = base_qs.filter(
                            models.Q(client_product_name__iexact=b) | models.Q(product_name__iexact=b)
                        ).first()
                        if cp:
                            break

                if cp:
                    out['unit_price'] = float(cp.unit_price)
                    out['currency'] = cp.currency or out['currency']
                    out['unit'] = cp.unit or out['unit']
                    if cp.client_product_name:
                        out['client_product_name'] = cp.client_product_name
                elif matched.base_price:
                    out['unit_price'] = float(matched.base_price)
                    out['currency'] = matched.currency or out['currency']

    # Quantity (best-effort)
    qty_str = str(fields.get('quantity') or '').replace(',', '').strip()
    if qty_str:
        try:
            out['quantity'] = float(_re.sub(r'[^\d.]', '', qty_str) or 0)
        except (ValueError, TypeError):
            pass

    # Unit override from extraction (only if more specific than default)
    if fields.get('unit'):
        out['unit'] = fields['unit']

    # If we extracted nothing meaningful, signal "no data" to caller
    if not extracted_product and not out['quantity'] and not out['destination_country']:
        return None
    return out


def _match_or_create_product(extracted_name):
    """Match an extracted product name to the Product master, or create a new
    placeholder Product if no match is found.

    When auto-creating:
    - The company **product name** (Product.name) is left BLANK so it shows up
      as a placeholder row in the Products page. An executive/admin/manager
      will edit it later and fill in the proper internal name.
    - The exact text the client used in the email is stored in
      **client_brand_names** so future emails using the same wording will match
      this product (and future quotations/PIs auto-fill correctly even before
      the executive has cleaned up the row).

    Returns: (Product instance, created: bool)
    """
    from products.models import Product

    if not extracted_name or not extracted_name.strip():
        return None, False

    matched = _match_product(extracted_name)
    if matched:
        # If this client wording isn't in the product's brand names yet, add it
        # so the next email with the same wording matches faster.
        raw = extracted_name.strip()
        existing_brands = [b.strip().lower() for b in (matched.client_brand_names or '').split(',') if b.strip()]
        if raw.lower() not in existing_brands:
            new_brands = (matched.client_brand_names + ', ' if matched.client_brand_names else '') + raw
            matched.client_brand_names = new_brands
            matched.save(update_fields=['client_brand_names'])
        return matched, False

    # No match — create a placeholder Product. Name is left blank for the
    # executive to fill in. The client's wording is captured in client_brand_names.
    raw = extracted_name.strip()
    product = Product.objects.create(
        name='',
        client_brand_names=raw,
        description=f'Auto-created from client email request ("{raw}"). '
                    f'Please set the company product name.',
        base_price=0,
        currency='USD',
        unit='KG',
        is_active=True,
    )
    logger.info(f'Auto-created placeholder Product (brand="{raw}") — needs executive review')
    return product, True


def _match_product(extracted_name):
    """
    Try to match an extracted product name to the Product master.
    Checks: exact name, client_brand_names, name+concentration similarity.
    Returns Product instance or None.
    """
    import re
    from products.models import Product

    if not extracted_name:
        return None

    name_lower = extracted_name.strip().lower()

    # 1. Exact name match (case-insensitive)
    product = Product.objects.filter(is_deleted=False, name__iexact=name_lower).first()
    if product:
        return product

    # 2. Extract concentration from client name (e.g. "aza 3%" → "3%")
    conc_match = re.search(r'(\d+\.?\d*)\s*%', name_lower)
    name_without_conc = re.sub(r'\s*\d+\.?\d*\s*%', '', name_lower).strip()

    # 3. Check client_brand_names field
    for product in Product.objects.filter(is_deleted=False, client_brand_names__gt=''):
        for brand in product.client_brand_names.split(','):
            brand = brand.strip().lower()
            if brand and brand in name_lower:
                # If concentration was specified, verify it matches
                if conc_match and product.concentration:
                    if conc_match.group(1) in product.concentration:
                        return product
                elif not conc_match:
                    return product
                # Brand matched but concentration didn't — still return as best match
                return product

    # 4. Partial name match against product name
    if name_without_conc:
        for product in Product.objects.filter(is_deleted=False):
            if name_without_conc in product.name.lower() or product.name.lower() in name_without_conc:
                if conc_match and product.concentration:
                    if conc_match.group(1) in product.concentration:
                        return product
                else:
                    return product

    # 5. Active ingredient match
    if name_without_conc:
        product = Product.objects.filter(
            is_deleted=False, active_ingredient__icontains=name_without_conc
        ).first()
        if product:
            return product

    return None


def _get_client_price(client, product):
    """
    Get client-specific price from ClientPriceList.
    Falls back to product base_price if no client-specific price exists.
    """
    if not product:
        return 0

    if client:
        from clients.models import ClientPriceList
        client_price = ClientPriceList.objects.filter(
            client=client,
            is_deleted=False,
        ).filter(
            models.Q(product=product) | models.Q(product_name__iexact=product.name)
        ).first()
        if client_price:
            return float(client_price.unit_price)

    return float(product.base_price) if product.base_price else 0


def _notify_executive(quote_request, assigned_to):
    """Create notification for the assigned executive."""
    if not assigned_to:
        return

    from notifications.models import Notification

    channel = quote_request.source_channel.title()
    product = quote_request.extracted_product or 'Unknown product'
    sender = quote_request.sender_name or quote_request.sender_email or 'Unknown sender'

    Notification.objects.create(
        user=assigned_to,
        notification_type='alert',
        title=f'New quote request from {channel}',
        message=f'{sender} requested a quote for {product} via {channel}. '
                f'Confidence: {int(quote_request.ai_confidence * 100)}%',
        link='/quote-requests',
    )
