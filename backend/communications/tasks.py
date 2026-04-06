from celery import shared_task
import logging

logger = logging.getLogger(__name__)


@shared_task(name='communications.sync_emails')
def sync_emails(email_account_id=None):
    """Sync emails from IMAP for one or all active EmailAccounts."""
    from communications.models import EmailAccount, Communication
    from communications.services import EmailService, ContactMatcher
    from django.utils import timezone

    if email_account_id:
        accounts = EmailAccount.objects.filter(id=email_account_id, is_active=True)
    else:
        accounts = EmailAccount.objects.filter(is_active=True)

    total_synced = 0
    for account in accounts:
        emails = EmailService.fetch_emails(account)
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

            # Notify executive about new inbound email from client
            if direction == 'inbound' and client:
                try:
                    from notifications.helpers import notify
                    notify(
                        title=f'New email from {external}',
                        message=f'{em["subject"][:80]}' if em.get('subject') else 'New email received',
                        notification_type='system',
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

            total_synced += 1

        account.last_synced = timezone.now()
        account.save(update_fields=['last_synced'])

    logger.info(f'Email sync complete: {total_synced} new emails synced')
    return f'{total_synced} emails synced'


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

    # Auto-attach quotation/PI PDF if keywords detected
    if communication.client:
        try:
            _auto_attach_documents(draft, communication)
        except Exception as e:
            logger.error(f'Auto-attach failed for draft {draft.id}: {e}')


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
            from communications.auto_quote_service import _get_client_price, _match_product
            from communications.quote_request_parser import extract_quote_fields

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

            # Extract product info from email
            fields = extract_quote_fields(text)
            product_name = fields.get('product', '')
            qty = 0
            try:
                qty = float(fields.get('quantity', 0)) if fields.get('quantity') else 0
            except (ValueError, TypeError):
                pass

            matched_product = _match_product(product_name) if product_name else None
            unit_price = _get_client_price(client, matched_product)

            q = Quotation.objects.create(
                quotation_number=generate_quotation_number(),
                client=client, currency=client.preferred_currency or 'USD',
                delivery_terms='FOB', country_of_origin='India',
                country_of_final_destination=client.country or '',
                created_by=communication.user,
            )
            QuotationItem.objects.create(
                quotation=q,
                product=matched_product,
                product_name=str(matched_product) if matched_product else (product_name or 'Product TBD'),
                quantity=qty, unit=fields.get('unit', 'KG'),
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
            from communications.auto_quote_service import _get_client_price, _match_product
            from communications.quote_request_parser import extract_quote_fields
            from datetime import date

            fields = extract_quote_fields(text)
            product_name = fields.get('product', '')
            qty = 0
            try:
                qty = float(fields.get('quantity', 0)) if fields.get('quantity') else 0
            except (ValueError, TypeError):
                pass

            matched_product = _match_product(product_name) if product_name else None
            unit_price = _get_client_price(client, matched_product)

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
                country_of_final_destination=client.country or '',
                currency=client.preferred_currency or 'USD',
                bank_details=DEFAULT_BANK,
            )
            line_total = qty * unit_price
            ProformaInvoiceItem.objects.create(
                pi=pi,
                product_name=str(matched_product) if matched_product else (product_name or 'Product TBD'),
                quantity=qty, unit=fields.get('unit', 'Ltrs'),
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
