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
from django.utils import timezone

logger = logging.getLogger(__name__)


def process_communication_for_quote(communication):
    """
    Main entry point — process an incoming communication for auto-quote generation.
    Returns QuoteRequest if created, None otherwise.
    """
    from .models import QuoteRequest

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

    # Get message text
    text = _get_message_text(communication)
    if not text or len(text.strip()) < 10:
        return None

    # Step 1: Detect quote intent
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
        if '@' in sender:
            domain = sender.split('@')[1]
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
            contact = Contact.objects.create(
                client=client,
                name=company_name.replace(' (Auto-created)', ''),
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

    # Match extracted product name to Product master
    client_product_name = qr.extracted_product or 'Product TBD'
    company_product_name = client_product_name
    matched_product = None

    if qr.extracted_product:
        matched_product = _match_product(qr.extracted_product)
        if matched_product:
            company_product_name = str(matched_product)  # includes concentration
        # If no match, both names stay the same — executive can fix later

    QuotationItem.objects.create(
        quotation=quotation,
        product=matched_product,
        product_name=company_product_name,
        client_product_name=client_product_name,
        description=qr.extracted_packaging or '',
        quantity=qty,
        unit=qr.extracted_unit or 'MT',
        unit_price=0,  # Executive fills in pricing
        total_price=0,
    )

    return quotation


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
