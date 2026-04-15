from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task(name='communications.sync_emails')
def sync_emails(email_account_id=None, days_back=None):
    """Sync emails from IMAP for one or all active EmailAccounts.

    Args:
        email_account_id: sync a specific account (or all if None)
        days_back: if set, fetch historical emails from N days ago
    """
    from communications.models import EmailAccount, Communication
    from communications.services import EmailService, ContactMatcher
    from django.utils import timezone

    if email_account_id:
        accounts = EmailAccount.objects.filter(id=email_account_id, is_active=True)
    else:
        accounts = EmailAccount.objects.filter(is_active=True)

    total_synced = 0
    for account in accounts:
        emails = EmailService.fetch_emails(account, days_back=days_back)
        for em in emails:
            # Dedup by message_id (primary)
            if em['message_id'] and Communication.objects.filter(
                email_message_id=em['message_id']
            ).exists():
                continue

            # Dedup fallback: same subject + sender + date (within 1 minute)
            if not em['message_id']:
                from datetime import timedelta
                exists = Communication.objects.filter(
                    subject=em['subject'],
                    external_email__in=[em['from_email'], em['to_email']],
                    created_at__gte=em['date'] - timedelta(minutes=1),
                    created_at__lte=em['date'] + timedelta(minutes=1),
                ).exists()
                if exists:
                    continue

            # Determine direction from folder or sender
            if em.get('default_direction') == 'outbound' or em['from_email'].lower() == account.email.lower():
                direction = 'outbound'
                external = em['to_email']
            else:
                direction = 'inbound'
                external = em['from_email']

            # Match to client
            client, contact = ContactMatcher.match_by_email(external)

            # Classify the email
            from communications.email_classifier import classify_email
            classification = classify_email(
                sender_email=external,
                subject=em['subject'],
                body=em['body'],
                client_matched=client is not None,
                contact_matched=contact is not None,
            )

            comm = Communication.objects.create(
                client=client,
                contact=contact,
                user=account.user,
                comm_type='email',
                direction=direction,
                subject=em['subject'],
                body=em['body'],
                status='received' if direction == 'inbound' else 'sent',
                email_message_id=em['message_id'],
                email_in_reply_to=em['in_reply_to'],
                email_account=account,
                external_email=external,
                email_cc=em.get('cc', ''),
                is_client_mail=classification['is_client_mail'],
                classification=classification['classification'],
                is_classified=True,
                is_read=(direction == 'outbound'),
            )

            # Override created_at with the actual email date
            if em.get('date'):
                Communication.objects.filter(id=comm.id).update(created_at=em['date'])

            # Auto-archive if sender is in the archived senders list
            if direction == 'inbound' and external:
                from communications.models import ArchivedSender
                if ArchivedSender.objects.filter(email__iexact=external).exists():
                    comm.soft_delete()
                    logger.info(f'Auto-archived email from {external} (sender in archive list)')
                    total_synced += 1
                    continue

            # Auto-create contact if client matched but no contact
            if client and not contact and direction == 'inbound':
                try:
                    from communications.views import _auto_create_contact
                    _auto_create_contact(client, comm)
                except Exception as e:
                    logger.error(f'Auto-contact creation failed for {comm.id}: {e}')

            # Notify executive about new inbound email from client.
            # Tier 1 (VIP) clients get an urgent 'alert' type notification
            # so they stand out in the notification bell.
            if direction == 'inbound' and client:
                try:
                    from notifications.helpers import notify
                    is_vip = getattr(client, 'tier', 'tier_3') == 'tier_1'
                    is_priority = getattr(client, 'tier', 'tier_3') == 'tier_2'
                    notify(
                        title=f'New email from {external}',
                        message=(f'{em["subject"][:80]}' if em.get('subject') else 'New email received')
                                + (' — Respond ASAP!' if is_vip else (' — Priority client' if is_priority else '')),
                        notification_type='alert' if is_vip else 'system',
                        link=f'/clients/{client.id}',
                        client=client,
                    )
                except Exception as e:
                    logger.error(f'Email notification failed: {e}')

            # Auto-generate AI draft reply for inbound emails with a matched client
            if direction == 'inbound' and client:
                try:
                    _generate_draft_for_email(comm)
                except Exception as e:
                    logger.error(f'Draft generation failed for {comm.id}: {e}')

            # Auto-detect PI request first (takes priority over quote request)
            pi_created = False
            if direction == 'inbound' and client:
                try:
                    from communications.auto_pi_service import process_communication_for_pi
                    pi_result = process_communication_for_pi(comm)
                    if pi_result:
                        pi_created = True
                except Exception as e:
                    logger.error(f'PI request detection failed for {comm.id}: {e}')

            # Auto-detect quote request from inbound messages (skip if PI was detected)
            if direction == 'inbound' and not pi_created:
                try:
                    from communications.auto_quote_service import process_communication_for_quote
                    process_communication_for_quote(comm)
                except Exception as e:
                    logger.error(f'Quote request detection failed for {comm.id}: {e}')

            # Auto-detect sample request — independent from quote/PI, runs on
            # any inbound email mentioning sample/trial keywords.
            if direction == 'inbound' and client:
                try:
                    _auto_create_sample_request(comm)
                except Exception as e:
                    logger.error(f'Sample request detection failed for {comm.id}: {e}')

            # Auto-revision: if this inbound email is a follow-up in a thread
            # that already has a SENT quotation or PI, and mentions changes /
            # modifications, auto-create a draft revision so the executive
            # can jump straight into editing rates without a manual Revise click.
            if direction == 'inbound' and client:
                try:
                    _auto_revise_if_needed(comm)
                except Exception as e:
                    logger.error(f'Auto-revision check failed for {comm.id}: {e}')

            total_synced += 1

        account.last_synced = timezone.now()
        account.save(update_fields=['last_synced'])

    logger.info(f'Email sync complete: {total_synced} new emails synced')
    return f'{total_synced} emails synced'


def _auto_revise_if_needed(communication):
    """Auto-create a draft revision of the most recent SENT quotation or PI
    when a client replies in the same thread asking for changes.

    Detection:
      1. Find earlier messages in this thread (via email_in_reply_to chain).
      2. Check if any of those messages have a linked SENT quotation or PI.
      3. Check if the new message body contains revision keywords (change,
         modify, revise, update price, different price, new quote, etc.).
      4. If yes, create a draft V(n+1) using the existing revise logic,
         which reuses an unsent draft if one already exists.

    The resulting draft shows up on the Inquiries / PI page as an amber chip
    that the executive can click to enter new rates and attach to email.
    """
    import re as _re

    if not communication.client_id:
        return

    body = (communication.body or '').replace('\n', ' ').replace('\r', ' ')
    text = _re.sub(r'<[^>]+>', ' ', body).lower()
    subject = (communication.subject or '').lower()
    full = f'{subject} {text}'

    # ── Step 1: detect revision intent ──
    REVISION_PATTERNS = [
        # General revision words
        r'\b(change|changes|changed)\b',
        r'\b(modif|modify|modification|modifications)\b',
        r'\b(revis|revise|revised|revision)\b',
        r'\b(amendment|amend|amended)\b',
        r'\b(update|updated)\b',
        r'\b(rework|adjust|correction|reissue|resend)\b',
        # Price revision
        r'\b(update|updated)\s+(the\s+)?(price|quote|quotation|pi|proforma)',
        r'\b(different|new|lower|better|reduced|revised)\s+(price|rate|pricing|quote|quotation)',
        r'\b(price\s+change|rate\s+change)\b',
        r'\b(can\s+you\s+)(change|update|revise|modify|reduce|lower)',
        r'\b(please\s+)(change|update|revise|modify|reduce|lower|send\s+updated)',
        r'\bnew\s+(quote|quotation|proforma|pi)\b',
        r'\bupdated\s+(quote|quotation|proforma|pi)\b',
        r'\brevised\s+(pi|proforma|quote|quotation)\b',
        r'\b(reduce|lower|decrease|increase)\s+(the\s+)?(price|rate|cost)\b',
        r'\b(best\s+price|final\s+price|offer\s+price)\b',
        r'\b(discount|competitive\s+price|match\s+price)\b',
        r'\bcan\s+you\s+do\s+better\b',
        # Too expensive / budget
        r'\b(too\s+high|too\s+expensive|not\s+acceptable|cannot\s+accept)\b',
        r'\b(bit\s+high|slightly\s+high|higher\s+side)\b',
        r'\b(above\s+budget|outside\s+budget|cost\s+is\s+an?\s+issue)\b',
        # Negotiation
        r'\b(counter\s*offer|negotiate|negotiation)\b',
        r'\b(requote|re-quote|re\s+quote)\b',
        # Incoterms / payment / freight
        r'\bchange\s+(the\s+)?incoterms?\b',
        r'\bchange\s+in\s+incoterms?\b',
        r'\bchange\s+(the\s+)?payment\s+terms?\b',
        r'\brevise\s+payment\s+terms?\b',
        r'\b(give|include|add)\s+(us\s+)?freight\s+charges?\b',
        r'\bchange\s+in\s+freight\s+charges?\b',
        r'\bfreight\s+revision\b',
        # Port / destination / delivery
        r'\bchange\s+(in\s+)?port\b',
        r'\bchange\s+destination\s+port\b',
        r'\bchange\s+in\s+quantity\b',
        r'\brevise\s+quantity\b',
        r'\bchange\s+delivery\b',
        r'\bdelivery\s+timeline\s+change\b',
        # Packing
        r'\bchange\s+in\s+packing\s+(size|numbers?)\b',
        r'\bpacking\s+modification\b',
        # HSN / description
        r'\b(change|correct)\s+(in\s+)?hsn\s+code\b',
        r'\b(change\s+in|update|correction)\s+(pdf\s+)?description\b',
        r'\b(include|add)\s+manufacturing\s+details\b',
        # Volume / conditional
        r'\bbulk\s+order\b',
        r'\bvolume\s+discount\b',
        r'\bfor\s+higher\s+quantity\b',
        r'\bif\s+you\s+reduce\b',
        r'\bwe\s+can\s+proceed\s+if\b',
        r'\bsubject\s+to\s+revision\b',
        # Competitor
        r'\bcompetitor\s+price\b',
        r'\bbetter\s+price\s+elsewhere\b',
        r'\blower\s+quote\s+from\s+others\b',
    ]
    has_revision_intent = any(_re.search(p, full) for p in REVISION_PATTERNS)
    if not has_revision_intent:
        return

    # ── Step 2: find earlier messages in this thread ──
    from .models import Communication, QuoteRequest
    thread_comm_ids = set()

    # Walk back via in_reply_to chain
    reply_to = communication.email_in_reply_to
    safety = 0
    while reply_to and safety < 20:
        earlier = Communication.objects.filter(
            email_message_id=reply_to, is_deleted=False
        ).first()
        if not earlier:
            break
        thread_comm_ids.add(earlier.id)
        reply_to = earlier.email_in_reply_to
        safety += 1

    # Also find any message whose in_reply_to points at our chain
    if communication.email_message_id:
        thread_comm_ids.update(
            Communication.objects.filter(
                email_in_reply_to=communication.email_message_id, is_deleted=False
            ).values_list('id', flat=True)
        )

    # Add the current message's own ID for completeness
    thread_comm_ids.add(communication.id)

    if not thread_comm_ids:
        return

    # ── Step 3: find SENT quotations in this thread ──
    from quotations.models import Quotation, QuotationItem
    sent_qr = QuoteRequest.objects.filter(
        source_communication_id__in=thread_comm_ids,
        linked_quotation__isnull=False,
        linked_quotation__status='sent',
        linked_quotation__is_deleted=False,
    ).select_related('linked_quotation').first()

    if sent_qr and sent_qr.linked_quotation:
        _auto_revise_quotation(sent_qr.linked_quotation, communication)

    # ── Step 4: find SENT PIs in this thread ──
    from finance.models import ProformaInvoice
    sent_pi = ProformaInvoice.objects.filter(
        source_communication_id__in=thread_comm_ids,
        status='sent',
        is_deleted=False,
    ).order_by('-version', '-created_at').first()

    if sent_pi:
        _auto_revise_pi(sent_pi, communication)

    if sent_qr or sent_pi:
        logger.info(
            f'Auto-revision triggered for comm {communication.id}: '
            f'quotation={"yes" if sent_qr else "no"} pi={"yes" if sent_pi else "no"}'
        )


def _auto_revise_quotation(quotation, communication):
    """Create a draft revision of a sent quotation, reusing an existing
    unsent draft if one is sitting in the chain. Mirrors the manual Revise
    button flow on the Inquiries page."""
    from quotations.models import Quotation, QuotationItem, generate_quotation_number

    # Walk to the latest version in the chain
    root = quotation
    while root.parent_id:
        try:
            root = Quotation.objects.get(id=root.parent_id)
        except Quotation.DoesNotExist:
            break
    all_ids = {root.id}
    stack = [root]
    while stack:
        node = stack.pop()
        for child in Quotation.objects.filter(parent=node, is_deleted=False).only('id'):
            if child.id not in all_ids:
                all_ids.add(child.id)
                stack.append(child)
    latest = (
        Quotation.objects.filter(id__in=all_ids, is_deleted=False)
        .order_by('-version', '-created_at')
        .first()
    ) or quotation

    # If the latest is already a draft revision, reuse it — don't inflate.
    if latest.status == 'draft' and latest.parent_id:
        logger.info(f'Auto-revise quotation: reusing existing draft {latest.quotation_number} V{latest.version}')
        return latest

    # Create new version
    new_version = (latest.version or 1) + 1
    q = Quotation.objects.create(
        quotation_number=generate_quotation_number(),
        client=latest.client,
        inquiry=latest.inquiry,
        version=new_version,
        parent=latest,
        currency=latest.currency,
        delivery_terms=latest.delivery_terms,
        payment_terms=latest.payment_terms,
        payment_terms_detail=latest.payment_terms_detail,
        freight_terms=latest.freight_terms,
        country_of_origin=latest.country_of_origin,
        country_of_final_destination=latest.country_of_final_destination,
        port_of_loading=latest.port_of_loading,
        port_of_discharge=latest.port_of_discharge,
        vessel_flight_no=latest.vessel_flight_no,
        final_destination=latest.final_destination,
        packaging_details=latest.packaging_details,
        display_overrides=latest.display_overrides,
        validity_days=latest.validity_days,
        notes=latest.notes,
        created_by=latest.created_by,
    )
    total = 0
    for item in latest.items.all():
        QuotationItem.objects.create(
            quotation=q, product=item.product,
            product_name=item.product_name,
            client_product_name=item.client_product_name,
            description=item.description,
            quantity=item.quantity, unit=item.unit,
            unit_price=item.unit_price, total_price=item.total_price,
        )
        total += float(item.total_price)
    q.subtotal = total
    q.total = total
    q.save(update_fields=['subtotal', 'total'])

    # Notify
    try:
        from notifications.helpers import notify
        notify(
            title=f'Auto-revision: {q.quotation_number} (V{new_version})',
            message=f'Client requested changes — draft V{new_version} created automatically from {latest.quotation_number}.',
            notification_type='system', link='/quote-requests',
            client=q.client,
        )
    except Exception:
        pass

    logger.info(f'Auto-revised quotation {latest.quotation_number} → {q.quotation_number} V{new_version}')
    return q


def _auto_revise_pi(pi, communication):
    """Create a draft revision of a sent PI, reusing an existing unsent
    draft if one is sitting in the chain. Mirrors the manual Revise button
    flow on the Proforma Invoices page."""
    from finance.models import ProformaInvoice, ProformaInvoiceItem
    from datetime import date as dt_date

    # Walk to the latest version in the chain
    root = pi
    while root.parent_id:
        try:
            root = ProformaInvoice.objects.get(id=root.parent_id)
        except ProformaInvoice.DoesNotExist:
            break
    all_ids = {root.id}
    stack = [root]
    while stack:
        node = stack.pop()
        for child in ProformaInvoice.objects.filter(parent=node, is_deleted=False).only('id'):
            if child.id not in all_ids:
                all_ids.add(child.id)
                stack.append(child)
    latest = (
        ProformaInvoice.objects.filter(id__in=all_ids, is_deleted=False)
        .order_by('-version', '-created_at')
        .first()
    ) or pi

    # If the latest is already a draft revision, reuse it — don't inflate.
    if latest.status == 'draft' and latest.parent_id:
        logger.info(f'Auto-revise PI: reusing existing draft {latest.invoice_number} V{latest.version}')
        return latest

    # Create new version
    new_version = (latest.version or 1) + 1
    count = ProformaInvoice.objects.count() + 1
    today = dt_date.today()
    invoice_number = f'{today.strftime("%y-%m")}/KB-{count:03d}'

    new_pi = ProformaInvoice.objects.create(
        client=latest.client,
        order=latest.order,
        source_communication=latest.source_communication,
        invoice_number=invoice_number,
        invoice_date=today,
        version=new_version,
        parent=latest,
        client_company_name=latest.client_company_name,
        client_tax_number=latest.client_tax_number,
        client_address=latest.client_address,
        client_pincode=latest.client_pincode,
        client_city_state_country=latest.client_city_state_country,
        client_phone=latest.client_phone,
        country_of_origin=latest.country_of_origin,
        country_of_final_destination=latest.country_of_final_destination,
        port_of_loading=latest.port_of_loading,
        port_of_discharge=latest.port_of_discharge,
        vessel_flight_no=latest.vessel_flight_no,
        final_destination=latest.final_destination,
        terms_of_trade=latest.terms_of_trade,
        terms_of_delivery=latest.terms_of_delivery,
        buyer_reference=latest.buyer_reference,
        currency=latest.currency,
        total=latest.total,
        amount_in_words=latest.amount_in_words,
        bank_details=latest.bank_details,
        display_overrides=latest.display_overrides,
        created_by=latest.created_by,
    )
    for item in latest.items.all():
        ProformaInvoiceItem.objects.create(
            pi=new_pi,
            product_name=item.product_name,
            client_product_name=item.client_product_name,
            packages_description=item.packages_description,
            description_of_goods=item.description_of_goods,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            total_price=item.total_price,
        )

    # Notify
    try:
        from notifications.helpers import notify
        notify(
            title=f'Auto-revision: {new_pi.invoice_number} (V{new_version})',
            message=f'Client requested changes — draft PI V{new_version} created automatically from {latest.invoice_number}.',
            notification_type='system', link='/proforma-invoices',
            client=new_pi.client,
        )
    except Exception:
        pass

    logger.info(f'Auto-revised PI {latest.invoice_number} → {new_pi.invoice_number} V{new_version}')
    return new_pi


def _auto_create_sample_request(communication):
    """If an inbound email mentions sample/trial keywords, auto-create ONE
    Sample row tied to it, with one SampleItem per product the client asked
    about. Clients often request multiple products in a single email — they
    must all live under the same parent sample, never split into separate
    samples.

    Idempotent: if a Sample already exists for this communication, do nothing.
    Uses `resolve_line_items_from_email` (plural) which runs an AI extraction
    that returns an array of products.
    """
    import re as _re
    from samples.models import Sample, SampleItem
    from communications.auto_quote_service import resolve_line_items_from_email

    if not communication.client:
        return None

    # Reuse existing sample for this communication
    if Sample.objects.filter(source_communication=communication, is_deleted=False).exists():
        return None

    # Keyword check — only auto-create when the client actually asked for a sample
    text = f'{communication.subject or ""} {communication.body or ""}'
    text = _re.sub(r'<[^>]+>', ' ', text).lower()
    if not _re.search(r'\b(sample|samples|trial|swatch|free sample)\b', text):
        return None

    lines = resolve_line_items_from_email(communication.client, communication) or []
    first = lines[0] if lines else {}
    # Mirror the first item into the legacy Sample.* fields for backward
    # compatibility with code that still reads sample.product_name directly.
    first_qty_str = ''
    if first:
        qv = first.get('quantity') or 0
        u = first.get('unit') or ''
        first_qty_str = f"{qv:g} {u}".strip() if qv else ''

    sample = Sample.objects.create(
        client=communication.client,
        source_communication=communication,
        product=first.get('product') if first else None,
        product_name=(first.get('product_name') or '') if first else '',
        client_product_name=(first.get('client_product_name') or '') if first else '',
        quantity=first_qty_str,
        notes='Auto-created from inbound email request.',
        created_by=communication.user,
    )

    # Create one SampleItem per extracted line — these are the multi-product
    # rows the user sees on the sample detail page.
    for line in lines:
        qv = line.get('quantity') or 0
        u = line.get('unit') or ''
        qty_str = f"{qv:g} {u}".strip() if qv else ''
        SampleItem.objects.create(
            sample=sample,
            product=line.get('product'),
            product_name=line.get('product_name') or '',
            client_product_name=line.get('client_product_name') or '',
            quantity=qty_str,
        )

    try:
        from notifications.helpers import notify
        product_summary = ', '.join(
            [(line.get('product_name') or line.get('client_product_name') or '') for line in lines if (line.get('product_name') or line.get('client_product_name'))]
        ) or '(pending review)'
        notify(
            title=f'Sample request: {product_summary}',
            message=(
                f'Auto-created sample request from email by '
                f'{communication.client.company_name} ({len(lines)} product{"s" if len(lines) != 1 else ""}).'
            ),
            notification_type='alert',
            link=f'/samples/{sample.id}',
            client=communication.client,
        )
    except Exception:
        pass

    logger.info(f'Auto-created Sample {sample.id} with {len(lines)} item(s) from communication {communication.id}')
    return sample


def _generate_draft_for_email(communication):
    """Generate an AI draft reply for an incoming email."""
    from communications.models import EmailDraft
    from communications.ai_email_service import generate_email_reply

    # Don't generate if draft already exists
    if EmailDraft.objects.filter(communication=communication).exists():
        return

    reply = generate_email_reply(communication)

    # Build CC: other client contacts + admin/manager emails
    cc = ''
    if communication.client:
        from communications.services import get_client_email_recipients
        to_email, _, cc = get_client_email_recipients(
            communication.client, source_communication=communication
        )

    draft = EmailDraft.objects.create(
        client=communication.client,
        communication=communication,
        subject=reply['subject'],
        body=reply['body'],
        to_email=communication.external_email or '',
        cc=cc,
        generated_by_ai=True,
    )
    logger.info(f'AI draft generated for email: {communication.subject}')

    # NOTE: Quotation/PI PDFs are NOT auto-attached to the AI draft.
    # The user opens the AI Draft modal and clicks "Generate Quotation" /
    # "Generate PI" — those buttons open the editor with values pre-filled
    # from the email (via resolve_line_item_from_email), let the user edit
    # and preview, then attach the final PDF and send.


def _auto_attach_documents(draft, communication):
    """Detect quote/PI keywords and auto-generate + attach PDFs to the draft."""
    import re
    from communications.models import DraftAttachment
    from django.core.files.base import ContentFile

    text = f'{communication.subject or ""} {communication.body or ""}'.lower()
    text = re.sub(r'<[^>]+>', ' ', text)  # strip HTML

    quote_keywords = re.search(r'quotation|quote|pricing|price list|rate card|rates', text, re.IGNORECASE)
    pi_keywords = re.search(r'proforma invoice|proforma|performa|\bPI\b|send PI|need PI', text, re.IGNORECASE)

    client = communication.client

    # Check if this is a revision request (reply in a thread with existing quotation)
    revision_keywords = re.search(r'change|modify|update|revise|different|not okay|not ok|instead|reduce|increase|lower|higher|adjust|correction', text, re.IGNORECASE)

    # Auto-generate and attach Quotation PDF
    if quote_keywords:
        try:
            from quotations.models import Quotation, QuotationItem, generate_quotation_number
            from quotations.quotation_service import generate_quotation_pdf
            from communications.auto_quote_service import resolve_line_item_from_email

            # Check if there's an existing quotation for this client that was sent
            # If revision keywords detected, create a new version from the latest sent quotation
            existing_qt = None
            if revision_keywords:
                existing_qt = Quotation.objects.filter(
                    client=client, status__in=['sent', 'approved', 'draft'], is_deleted=False
                ).order_by('-created_at').first()

            if existing_qt and revision_keywords:
                # Create revision
                new_version = existing_qt.version + 1
                q = Quotation.objects.create(
                    quotation_number=generate_quotation_number(),
                    client=client, inquiry=existing_qt.inquiry,
                    version=new_version, parent=existing_qt,
                    currency=existing_qt.currency,
                    delivery_terms=existing_qt.delivery_terms,
                    payment_terms=existing_qt.payment_terms,
                    payment_terms_detail=existing_qt.payment_terms_detail,
                    freight_terms=existing_qt.freight_terms,
                    country_of_origin=existing_qt.country_of_origin,
                    country_of_final_destination=existing_qt.country_of_final_destination,
                    port_of_loading=existing_qt.port_of_loading,
                    port_of_discharge=existing_qt.port_of_discharge,
                    packaging_details=existing_qt.packaging_details,
                    display_overrides=existing_qt.display_overrides,
                    validity_days=existing_qt.validity_days,
                    notes=f'Revision v{new_version} — client requested changes via email.\n{existing_qt.notes}',
                    created_by=communication.user,
                )
                total = 0
                for item in existing_qt.items.all():
                    QuotationItem.objects.create(
                        quotation=q, product=item.product,
                        product_name=item.product_name,
                        client_product_name=item.client_product_name,
                        description=item.description,
                        quantity=item.quantity, unit=item.unit,
                        unit_price=item.unit_price, total_price=item.total_price,
                    )
                    total += float(item.total_price)
                q.subtotal = total
                q.total = total
                q.save(update_fields=['subtotal', 'total'])

                if existing_qt.status in ['sent', 'approved', 'draft']:
                    existing_qt.status = 'expired'
                    existing_qt.save(update_fields=['status'])

                pdf_buffer = generate_quotation_pdf(q)
                pdf_bytes = pdf_buffer.read()
                filename = f'Quotation_{q.quotation_number.replace("/", "-")}_v{new_version}.pdf'
                att = DraftAttachment(draft=draft, filename=filename, file_size=len(pdf_bytes))
                att.file.save(filename, ContentFile(pdf_bytes), save=True)
                logger.info(f'Auto-attached revised quotation {q.quotation_number} v{new_version} to draft {draft.id}')
                return  # Don't create a new quotation if we revised

            # Resolve a complete line item from the email using the shared helper
            line = resolve_line_item_from_email(client, communication) or {}
            qty = line.get('quantity', 0)
            unit_price = line.get('unit_price', 0)

            q = Quotation.objects.create(
                quotation_number=generate_quotation_number(),
                client=client,
                currency=line.get('currency') or client.preferred_currency or 'USD',
                delivery_terms='FOB', country_of_origin='India',
                country_of_final_destination=line.get('destination_country') or client.country or '',
                port_of_discharge=line.get('destination_port') or '',
                created_by=communication.user,
            )
            QuotationItem.objects.create(
                quotation=q,
                product=line.get('product'),
                product_name=line.get('product_name') or 'Product TBD',
                client_product_name=line.get('client_product_name', ''),
                description=line.get('description', ''),
                quantity=qty, unit=line.get('unit') or 'KG',
                unit_price=unit_price, total_price=qty * unit_price,
            )
            q.subtotal = qty * unit_price
            q.total = qty * unit_price
            q.save(update_fields=['subtotal', 'total'])

            pdf_buffer = generate_quotation_pdf(q)
            pdf_bytes = pdf_buffer.read()
            filename = f'Quotation_{q.quotation_number.replace("/", "-")}.pdf'
            att = DraftAttachment(draft=draft, filename=filename, file_size=len(pdf_bytes))
            att.file.save(filename, ContentFile(pdf_bytes), save=True)
            logger.info(f'Auto-attached quotation {q.quotation_number} to draft {draft.id}')
        except Exception as e:
            logger.error(f'Auto-attach quotation failed: {e}')

    # Auto-generate and attach PI PDF
    if pi_keywords:
        try:
            from finance.models import ProformaInvoice, ProformaInvoiceItem
            from finance.pi_service import generate_pi_pdf, DEFAULT_BANK, _number_to_words
            from communications.auto_quote_service import resolve_line_item_from_email
            from datetime import date

            line = resolve_line_item_from_email(client, communication) or {}
            qty = line.get('quantity', 0)
            unit_price = line.get('unit_price', 0)

            count = ProformaInvoice.objects.count() + 1
            today = date.today()
            pi = ProformaInvoice.objects.create(
                client=client, source_communication=communication,
                invoice_number=f'{today.strftime("%y-%m")}/KB-{count:03d}',
                invoice_date=today, created_by=communication.user,
                client_company_name=client.company_name,
                client_tax_number=client.tax_number or '',
                client_address=client.address or '',
                country_of_origin='India',
                country_of_final_destination=line.get('destination_country') or client.country or '',
                currency=line.get('currency') or client.preferred_currency or 'USD',
                bank_details=DEFAULT_BANK,
            )
            line_total = qty * unit_price
            # PI mapping: product_name=client brand, description_of_goods=company name
            ProformaInvoiceItem.objects.create(
                pi=pi,
                product_name=line.get('client_product_name') or line.get('product_name') or 'Product TBD',
                client_product_name=line.get('client_product_name', ''),
                description_of_goods=line.get('product_name') or '',
                packages_description=line.get('description', ''),
                quantity=qty, unit=line.get('unit') or 'Ltrs',
                unit_price=unit_price, total_price=line_total,
            )
            pi.total = line_total
            pi.amount_in_words = _number_to_words(line_total, pi.currency)
            pi.save(update_fields=['total', 'amount_in_words'])

            pdf_buffer = generate_pi_pdf(pi)
            pdf_bytes = pdf_buffer.read()
            filename = f'PI_{pi.invoice_number.replace("/", "-")}.pdf'
            att = DraftAttachment(draft=draft, filename=filename, file_size=len(pdf_bytes))
            att.file.save(filename, ContentFile(pdf_bytes), save=True)
            logger.info(f'Auto-attached PI {pi.invoice_number} to draft {draft.id}')
        except Exception as e:
            logger.error(f'Auto-attach PI failed: {e}')
