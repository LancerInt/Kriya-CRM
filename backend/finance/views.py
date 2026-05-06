from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from .models import Invoice, Payment, FIRCRecord, GSTRecord, ProformaInvoice, CommercialInvoice, LogisticsInvoice, PackingInstructionForm, PackingList, ComplianceDocument
from .serializers import (InvoiceSerializer, PaymentSerializer, FIRCRecordSerializer,
                          GSTRecordSerializer, ProformaInvoiceSerializer,
                          CommercialInvoiceSerializer, LogisticsInvoiceSerializer,
                          PackingInstructionFormSerializer, PackingListSerializer,
                          ComplianceDocumentSerializer)
from notifications.helpers import notify


class InvoiceViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    filterset_fields = ['client', 'order', 'invoice_type', 'status']

    def get_queryset(self):
        qs = Invoice.objects.filter(is_deleted=False).select_related('client', 'order').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    @action(detail=True, methods=['get'], url_path='download-pdf')
    def download_pdf(self, request, pk=None):
        invoice = self.get_object()
        from common.pdf_utils import generate_invoice_pdf
        pdf_buffer = generate_invoice_pdf(invoice)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{invoice.invoice_number}.pdf"'
        return response


class PaymentViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = PaymentSerializer
    filterset_fields = ['client', 'invoice', 'mode']
    def get_queryset(self):
        qs = Payment.objects.filter(is_deleted=False).select_related('client', 'invoice')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    def perform_create(self, serializer):
        payment = serializer.save()
        notify(
            title=f'Payment received: {payment.currency} {payment.amount:,.2f}',
            message=f'{self.request.user.full_name} recorded payment from {payment.client.company_name}.',
            notification_type='alert', link='/finance',
            actor=self.request.user, client=payment.client,
        )
        # Auto-create purchase history from invoice items
        if payment.invoice:
            _auto_purchase_history_from_invoice(payment)


def _auto_purchase_history_from_invoice(payment):
    """Create purchase history entries from the paid invoice's items."""
    from clients.models import PurchaseHistory
    invoice = payment.invoice

    for item in invoice.items.all():
        exists = PurchaseHistory.objects.filter(
            client=payment.client, invoice_number=invoice.invoice_number,
            product_name=item.product_name, is_deleted=False,
        ).exists()
        if exists:
            continue

        PurchaseHistory.objects.create(
            client=payment.client,
            product_name=item.product_name,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            total_price=item.total_price,
            currency=payment.currency,
            purchase_date=payment.payment_date,
            invoice_number=invoice.invoice_number,
            status='completed',
        )


class FIRCRecordViewSet(viewsets.ModelViewSet):
    queryset = FIRCRecord.objects.all()
    serializer_class = FIRCRecordSerializer
    filterset_fields = ['status']

class GSTRecordViewSet(viewsets.ModelViewSet):
    queryset = GSTRecord.objects.all()
    serializer_class = GSTRecordSerializer
    filterset_fields = ['status']


class ProformaInvoiceViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = ProformaInvoiceSerializer
    filterset_fields = ['client', 'order', 'status']

    def get_queryset(self):
        qs = ProformaInvoice.objects.filter(is_deleted=False).select_related('client', 'order').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    def list(self, request, *args, **kwargs):
        # Lazy back-fills run on every list call:
        #   1) link legacy PIs to the inbound email they were created from
        #   2) flip status to 'sent' if that email's draft has been sent
        try:
            self._backfill_source_communication()
            self._backfill_sent_status()
        except Exception:
            pass
        return super().list(request, *args, **kwargs)

    def _backfill_source_communication(self):
        """For legacy PIs (created before source_communication was tracked),
        infer the source by finding the most recent inbound email for the
        same client that was created before the PI itself.
        """
        from communications.models import Communication
        legacy = self.get_queryset().filter(source_communication__isnull=True).only(
            'id', 'client_id', 'created_at'
        )
        for pi in legacy:
            if not pi.client_id:
                continue
            comm = Communication.objects.filter(
                client_id=pi.client_id,
                comm_type='email', direction='inbound', is_deleted=False,
                created_at__lte=pi.created_at,
            ).order_by('-created_at').first()
            if comm:
                ProformaInvoice.objects.filter(id=pi.id).update(source_communication=comm)

    def _backfill_sent_status(self):
        from communications.models import EmailDraft
        draft_pis = self.get_queryset().filter(
            status='draft', source_communication__isnull=False,
        )
        # Find which of those source_communications have a sent draft
        sent_comm_ids = set(
            EmailDraft.objects.filter(
                communication__in=[p.source_communication_id for p in draft_pis],
                status='sent',
            ).values_list('communication_id', flat=True)
        )
        if sent_comm_ids:
            ProformaInvoice.objects.filter(
                id__in=[p.id for p in draft_pis if p.source_communication_id in sent_comm_ids]
            ).update(status='sent')

    @action(detail=False, methods=['get'], url_path='count')
    def count_for_user(self, request):
        """Count of DRAFT proforma invoices the current user can see (role-filtered).

        Used by the header badge — same role filtering as the list endpoint
        so executives only see counts for their own clients' PIs.
        """
        # Run the same lazy back-fill so the count matches the list page
        try:
            self._backfill_sent_status()
        except Exception:
            pass
        count = self.get_queryset().filter(status='draft').count()
        return Response({'count': count})

    @action(detail=True, methods=['post'], url_path='save-with-items')
    def save_with_items(self, request, pk=None):
        """Save PI fields + replace all items in one request."""
        from .models import ProformaInvoiceItem
        pi = self.get_object()
        data = dict(request.data)
        items_data = data.pop('items', None)

        allowed = {
            'invoice_date', 'status', 'client_company_name', 'client_tax_number',
            'client_address', 'client_pincode', 'client_city_state_country', 'client_phone',
            'country_of_origin', 'country_of_final_destination', 'port_of_loading',
            'port_of_discharge', 'vessel_flight_no', 'final_destination',
            'terms_of_trade', 'terms_of_delivery', 'buyer_reference',
            'currency', 'amount_in_words', 'bank_details', 'display_overrides',
        }
        for field in allowed:
            if field in data:
                setattr(pi, field, data[field])

        if items_data is not None:
            pi.items.all().delete()
            total = 0
            for item_data in items_data:
                qty = float(item_data.get('quantity', 0) or 0)
                price = float(item_data.get('unit_price', 0) or 0)
                line_total = qty * price
                total += line_total
                ProformaInvoiceItem.objects.create(
                    pi=pi,
                    product_name=item_data.get('product_name', ''),
                    packages_description=item_data.get('packages_description', ''),
                    description_of_goods=item_data.get('description_of_goods', ''),
                    quantity=qty,
                    unit=item_data.get('unit', 'Ltrs'),
                    unit_price=price,
                    total_price=line_total,
                )
            pi.total = total
            # Auto-update amount_in_words with grand total (including freight/insurance/discount)
            ov = pi.display_overrides if isinstance(pi.display_overrides, dict) else {}
            freight = float(ov.get('_freight', 0) or 0)
            insurance = float(ov.get('_insurance', 0) or 0)
            discount = float(ov.get('_discount', 0) or 0)
            grand_total = total + freight + insurance - discount
            from finance.pi_service import _number_to_words
            pi.amount_in_words = _number_to_words(grand_total, pi.currency)
        pi.save()
        return Response(ProformaInvoiceSerializer(pi).data)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        """Create a PI from an order, auto-filling client data."""
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        from orders.models import Order
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        from .pi_service import create_pi_from_order
        pi = create_pi_from_order(order, request.user)
        return Response(ProformaInvoiceSerializer(pi).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        """Generate and return PI PDF."""
        pi = self.get_object()
        from .pi_service import generate_pi_pdf
        pdf_buffer = generate_pi_pdf(pi)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="PI_{pi.invoice_number.replace("/", "-")}_{pi.client_company_name.replace(" ", "_")}.pdf"'
        return response

    @action(detail=True, methods=['post'], url_path='attach-to-email')
    def attach_to_email(self, request, pk=None):
        """Generate the PI PDF and attach it to the source email's AI Draft.
        Mirrors QuotationViewSet.attach_to_email — creates a draft if needed,
        replaces any older PI_*.pdf attachment, and pre-fills the body with
        an AI-generated reply that references the new PI.
        """
        from communications.models import (
            Communication, EmailDraft, DraftAttachment,
        )
        from django.core.files.base import ContentFile
        from .pi_service import generate_pi_pdf

        pi = self.get_object()

        comm = None
        if pi.source_communication_id:
            comm = Communication.objects.filter(id=pi.source_communication_id).first()
        if not comm and pi.client_id:
            comm = Communication.objects.filter(
                client_id=pi.client_id,
                comm_type='email', direction='inbound', is_deleted=False,
            ).order_by('-created_at').first()
        if not comm:
            return Response(
                {'error': 'No source email found to attach to'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        draft = EmailDraft.objects.filter(
            communication=comm, status='draft'
        ).order_by('-updated_at').first()

        ai_subject = f'Re: {comm.subject}' if comm.subject else 'Re: Proforma Invoice'
        ai_body = ''
        try:
            from communications.ai_email_service import generate_email_reply
            reply = generate_email_reply(comm)
            if reply:
                ai_subject = reply.get('subject') or ai_subject
                ai_body = reply.get('body') or ''
        except Exception:
            pass
        if not ai_body:
            client_name = comm.client.company_name if comm.client_id and comm.client else 'Valued Customer'
            ai_body = (
                f'<p>Dear {client_name},</p>'
                f'<p>Please find attached our Proforma Invoice '
                f'<strong>{pi.invoice_number}</strong> for your review.</p>'
                f'<p>Kindly review the document and confirm so we can proceed.</p>'
                f'<p>Best regards,<br/>{request.user.full_name or request.user.username}</p>'
            )

        if not draft:
            to_email = comm.external_email or ''
            if not to_email and comm.client_id:
                from clients.models import Contact
                primary = Contact.objects.filter(
                    client_id=comm.client_id, is_primary=True
                ).first() or Contact.objects.filter(client_id=comm.client_id).first()
                if primary and primary.email:
                    to_email = primary.email
            draft = EmailDraft.objects.create(
                communication=comm,
                to_email=to_email,
                subject=ai_subject,
                body=ai_body,
                cc='',
                status='draft',
                created_by=request.user,
                edited_by=request.user,
            )
        else:
            update_fields = []
            if not (draft.to_email or '').strip():
                fallback_to = comm.external_email or ''
                if not fallback_to and comm.client_id:
                    from clients.models import Contact
                    primary = Contact.objects.filter(
                        client_id=comm.client_id, is_primary=True
                    ).first() or Contact.objects.filter(client_id=comm.client_id).first()
                    if primary and primary.email:
                        fallback_to = primary.email
                if fallback_to:
                    draft.to_email = fallback_to
                    update_fields.append('to_email')
            if not (draft.body or '').strip():
                if not draft.subject:
                    draft.subject = ai_subject
                    update_fields.append('subject')
                draft.body = ai_body
                update_fields.append('body')
            if update_fields:
                draft.edited_by = request.user
                update_fields.append('edited_by')
                draft.save(update_fields=update_fields)

        # Generate PDF and replace any existing PI_ attachment so the latest
        # revision is what gets sent.
        pdf_buffer = generate_pi_pdf(pi)
        pdf_bytes = pdf_buffer.read() if hasattr(pdf_buffer, 'read') else pdf_buffer
        filename = f'PI_{pi.invoice_number.replace("/", "-")}.pdf'

        DraftAttachment.objects.filter(
            draft=draft, filename__startswith='PI_'
        ).delete()

        att = DraftAttachment(draft=draft, filename=filename, file_size=len(pdf_bytes))
        att.file.save(filename, ContentFile(pdf_bytes), save=True)

        return Response({
            'status': 'attached',
            'communication_id': str(comm.id),
            'client_id': str(comm.client_id) if comm.client_id else None,
            'draft_id': str(draft.id),
            'filename': filename,
        })

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        """Generate PDF and send to client via email."""
        pi = self.get_object()
        from .pi_service import send_pi_email
        try:
            # Assign a permanent sequential number at send-time
            if pi.status != 'sent':
                from .models import generate_pi_number
                pi.invoice_number = generate_pi_number()
                pi.status = 'sent'
                pi.save(update_fields=['invoice_number', 'status'])
            sent_to = send_pi_email(pi, request.user)
            notify(
                title=f'PI {pi.invoice_number} sent to {pi.client.company_name}',
                message=f'{request.user.full_name} sent PI to {sent_to}.',
                notification_type='system', link='/proforma-invoices',
                actor=request.user, client=pi.client,
            )
            return Response({'status': 'sent', 'sent_to': sent_to})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='convert-to-order')
    def convert_to_order(self, request, pk=None):
        """Convert a Proforma Invoice into an Order."""
        from orders.models import Order, OrderItem
        pi = self.get_object()

        # Check if order already exists for this PI
        if pi.order:
            from orders.serializers import OrderSerializer
            return Response(OrderSerializer(pi.order).data)

        # Generate order number
        order_count = Order.objects.count() + 1
        order = Order.objects.create(
            order_number=f'ORD-{order_count:05d}',
            client=pi.client,
            order_type='pi_based',
            currency=pi.currency,
            delivery_terms=pi.terms_of_delivery.split(' - ')[0].strip() if pi.terms_of_delivery else 'FOB',
            payment_terms=pi.terms_of_trade or '',
            total=pi.total,
            notes=f'Converted from PI {pi.invoice_number}',
            created_by=request.user,
            # Inherit the inquiry email so order-stage messages stay threaded.
            source_communication=getattr(pi, 'source_communication', None),
        )

        for item in pi.items.all():
            OrderItem.objects.create(
                order=order,
                product_name=item.product_name,
                client_product_name=item.client_product_name,
                description=item.description_of_goods or '',
                quantity=item.quantity,
                unit=item.unit,
                unit_price=item.unit_price,
                total_price=item.total_price,
            )

        # Link PI to order
        pi.order = order
        pi.save(update_fields=['order'])

        notify(
            title=f'Order created from PI {pi.invoice_number}',
            message=f'{request.user.full_name} converted PI to order {order.order_number}.',
            notification_type='system', link='/sales-orders',
            actor=request.user, client=pi.client,
        )

        from orders.serializers import OrderSerializer
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='revise')
    def revise(self, request, pk=None):
        """Create a new version of this PI, copying all items.

        Mirrors QuotationViewSet.revise — used when a client asks for changes
        on a previously-sent PI. The original is left intact (so the history
        is preserved); the new row carries version+1 and parent → original.
        """
        from .models import ProformaInvoiceItem
        from datetime import date as dt_date

        clicked = self.get_object()
        # Always pivot off the LATEST version in the chain — not the row the
        # user happened to click on. Otherwise revising V1 when V2 already
        # exists would create another V2 instead of progressing to V3.
        root = clicked
        while root.parent_id:
            root = root.parent
        all_ids = {root.id}
        stack = [root]
        while stack:
            node = stack.pop()
            for child in ProformaInvoice.objects.filter(parent=node, is_deleted=False).only('id', 'parent_id'):
                if child.id not in all_ids:
                    all_ids.add(child.id)
                    stack.append(child)
        original = (
            ProformaInvoice.objects.filter(id__in=all_ids, is_deleted=False)
            .order_by('-version', '-created_at')
            .first()
        ) or clicked

        # ── Reuse existing unsent draft revision ──
        # If the latest row is already a DRAFT (i.e. an earlier Revise click
        # spawned it but the user closed the editor without sending) just
        # return that row instead of creating yet another version. This
        # prevents version inflation: cancelling Revise no longer leaves
        # behind a stranded V3 that gets stuck waiting for V4.
        if original.status == 'draft' and original.id != clicked.id:
            return Response(ProformaInvoiceSerializer(original).data, status=status.HTTP_200_OK)
        # Same rule when the user clicks Revise on V1 (already sent) but a
        # draft V2 from an earlier click is sitting in the chain — reuse it.
        if original.status == 'draft' and original.parent_id:
            return Response(ProformaInvoiceSerializer(original).data, status=status.HTTP_200_OK)

        new_version = (original.version or 1) + 1

        from .models import generate_pi_number
        today = dt_date.today()
        invoice_number = generate_pi_number()

        pi = ProformaInvoice.objects.create(
            client=original.client,
            order=original.order,
            source_communication=original.source_communication,
            invoice_number=invoice_number,
            invoice_date=today,
            version=new_version,
            parent=original,
            client_company_name=original.client_company_name,
            client_tax_number=original.client_tax_number,
            client_address=original.client_address,
            client_pincode=original.client_pincode,
            client_city_state_country=original.client_city_state_country,
            client_phone=original.client_phone,
            country_of_origin=original.country_of_origin,
            country_of_final_destination=original.country_of_final_destination,
            port_of_loading=original.port_of_loading,
            port_of_discharge=original.port_of_discharge,
            vessel_flight_no=original.vessel_flight_no,
            final_destination=original.final_destination,
            terms_of_trade=original.terms_of_trade,
            terms_of_delivery=original.terms_of_delivery,
            buyer_reference=original.buyer_reference,
            currency=original.currency,
            total=original.total,
            amount_in_words=original.amount_in_words,
            bank_details=original.bank_details,
            display_overrides=original.display_overrides,
            created_by=request.user,
        )
        for item in original.items.all():
            ProformaInvoiceItem.objects.create(
                pi=pi,
                product_name=item.product_name,
                client_product_name=item.client_product_name,
                packages_description=item.packages_description,
                description_of_goods=item.description_of_goods,
                quantity=item.quantity,
                unit=item.unit,
                unit_price=item.unit_price,
                total_price=item.total_price,
            )

        notify(
            title=f'PI revised: {pi.invoice_number} (v{new_version})',
            message=f'{request.user.full_name} created revision v{new_version} from {original.invoice_number}.',
            notification_type='system', link='/proforma-invoices',
            actor=request.user, client=pi.client,
        )
        return Response(ProformaInvoiceSerializer(pi).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='versions')
    def versions(self, request, pk=None):
        """Return the full version chain (root + every revision) for this PI."""
        pi = self.get_object()
        root = pi
        while root.parent:
            root = root.parent
        all_ids = {root.id}
        # Walk all descendants of the root
        stack = [root]
        while stack:
            node = stack.pop()
            children = list(ProformaInvoice.objects.filter(parent=node, is_deleted=False))
            for c in children:
                all_ids.add(c.id)
                stack.append(c)
        chain = ProformaInvoice.objects.filter(id__in=all_ids).order_by('version', 'created_at')
        return Response(ProformaInvoiceSerializer(chain, many=True).data)

    @action(detail=False, methods=['post'], url_path='create-standalone')
    def create_standalone(self, request):
        """Create a standalone PI (not from an order) for a client.

        Optionally accepts ``communication_id`` — when provided, the first line
        item is auto-filled from the email body using AI extraction:
        product (matched/created in the Products tab), client product name
        (from Product master client_brand_names), quantity (if mentioned),
        and unit price (from this client's ClientPriceList, falling back to
        the Product master base price).
        """
        from .models import ProformaInvoiceItem
        from .pi_service import DEFAULT_BANK
        from datetime import date as dt_date

        client_id = request.data.get('client_id')
        communication_id = request.data.get('communication_id')
        if not client_id:
            return Response({'error': 'client_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        from clients.models import Client
        try:
            client = Client.objects.get(id=client_id, is_deleted=False)
        except Client.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)

        # ── Resolve the line item from the source email up-front ──
        # Works for both new and previously-generated drafts: every click
        # re-runs the AI extractor against the original email.
        line = None
        if communication_id:
            try:
                from communications.models import Communication
                from communications.auto_quote_service import resolve_line_item_from_email
                comm = Communication.objects.filter(id=communication_id).first()
                if comm:
                    line = resolve_line_item_from_email(client, comm)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f'PI pre-fill failed: {e}')

        # ── Reuse / repair an existing PI tied to this communication ──
        # The auto-PI pipeline may have already created a PI for this email.
        # If empty, repair it in-place using the freshly-resolved line so
        # previously-generated drafts get the same auto-fill new ones do.
        if communication_id:
            try:
                existing_pi = ProformaInvoice.objects.filter(
                    source_communication_id=communication_id,
                    is_deleted=False,
                ).order_by('-created_at').first()
                if existing_pi:
                    # Only treat as "already populated" if a real price is set —
                    # otherwise repair stale rows (name only, price 0) in-place.
                    has_real_item = existing_pi.items.exclude(product_name='').filter(unit_price__gt=0).exists()
                    if has_real_item:
                        # Patch any items that are missing description_of_goods
                        # (the company product name from the Product master). This
                        # back-fills earlier PIs that were saved before the field
                        # mapping fix without losing any other manual edits.
                        if line and line.get('product_name'):
                            for it in existing_pi.items.filter(description_of_goods=''):
                                it.description_of_goods = line['product_name']
                                it.save(update_fields=['description_of_goods'])
                        return Response(ProformaInvoiceSerializer(existing_pi).data, status=status.HTTP_200_OK)
                    if line:
                        existing_pi.items.all().delete()
                        qty = line['quantity']
                        price = line['unit_price']
                        # PI mapping (different from Quotation):
                        #   product_name        = client brand name (Product Details col)
                        #   description_of_goods = company product name (Description col)
                        ProformaInvoiceItem.objects.create(
                            pi=existing_pi,
                            product_name=line['client_product_name'] or line['product_name'],
                            client_product_name=line['client_product_name'],
                            description_of_goods=line['product_name'],
                            packages_description=line['description'],
                            quantity=qty, unit=line['unit'] or 'Ltrs',
                            unit_price=price, total_price=qty * price,
                        )
                        if line.get('currency'):
                            existing_pi.currency = line['currency']
                        if line.get('destination_country') and not existing_pi.country_of_final_destination:
                            existing_pi.country_of_final_destination = line['destination_country']
                        existing_pi.total = qty * price
                        existing_pi.save()
                        return Response(ProformaInvoiceSerializer(existing_pi).data, status=status.HTTP_200_OK)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f'Linked PI repair failed: {e}')

        # ── Auto-versioning ──
        # If this client already has a PREVIOUS SENT PI tied to a *different*
        # email, treat the current call as a revision request: spawn a new row
        # with version+1 and parent → previous PI. This is the case where the
        # client wrote back asking for changes on an earlier PI.
        parent_pi = None
        next_version = 1
        if communication_id:
            previous = ProformaInvoice.objects.filter(
                client=client,
                is_deleted=False,
                status='sent',
            ).exclude(source_communication_id=communication_id).order_by('-created_at').first()
            if previous:
                parent_pi = previous
                next_version = (previous.version or 1) + 1

        from .models import generate_pi_number
        today = dt_date.today()
        invoice_number = generate_pi_number()

        # When this is a revision, copy structural fields from the parent so
        # the new version starts with the same terms / ports / packaging as the
        # previously-sent PI, then overlay any freshly-extracted line data.
        if parent_pi:
            pi = ProformaInvoice.objects.create(
                client=client,
                source_communication_id=communication_id if communication_id else None,
                invoice_number=invoice_number,
                invoice_date=today,
                version=next_version,
                parent=parent_pi,
                created_by=request.user,
                client_company_name=parent_pi.client_company_name,
                client_tax_number=parent_pi.client_tax_number,
                client_address=parent_pi.client_address,
                client_pincode=parent_pi.client_pincode,
                client_city_state_country=parent_pi.client_city_state_country,
                client_phone=parent_pi.client_phone,
                country_of_origin=parent_pi.country_of_origin,
                country_of_final_destination=(line or {}).get('destination_country') or parent_pi.country_of_final_destination,
                port_of_loading=parent_pi.port_of_loading,
                port_of_discharge=(line or {}).get('destination_port') or parent_pi.port_of_discharge,
                vessel_flight_no=parent_pi.vessel_flight_no,
                final_destination=parent_pi.final_destination,
                terms_of_trade=parent_pi.terms_of_trade,
                terms_of_delivery=parent_pi.terms_of_delivery,
                buyer_reference=parent_pi.buyer_reference,
                currency=(line or {}).get('currency') or parent_pi.currency,
                bank_details=parent_pi.bank_details,
                display_overrides=parent_pi.display_overrides,
            )
        else:
            pi = ProformaInvoice.objects.create(
                client=client,
                source_communication_id=communication_id if communication_id else None,
                invoice_number=invoice_number,
                invoice_date=today,
                version=next_version,
                parent=parent_pi,
                created_by=request.user,
                client_company_name=client.company_name,
                client_tax_number=client.tax_number or '',
                client_address=client.address or '',
                client_pincode=client.postal_code or '',
                client_city_state_country=f'{client.city}, {client.state}, {client.country}'.strip(', '),
                client_phone=client.phone_number or (client.contacts.filter(is_primary=True, is_deleted=False).first().phone if client.contacts.filter(is_primary=True, is_deleted=False).exists() else ''),
                country_of_origin='India',
                country_of_final_destination=(line or {}).get('destination_country') or client.country or '',
                port_of_discharge=(line or {}).get('destination_port') or '',
                currency=(line or {}).get('currency') or client.preferred_currency or 'USD',
                bank_details=DEFAULT_BANK,
                display_overrides={
                    '_attend': f"Attend: {client.contacts.filter(is_primary=True, is_deleted=False).first().name}" if client.contacts.filter(is_primary=True, is_deleted=False).exists() else '',
                },
            )

        if line:
            qty = line['quantity']
            price = line['unit_price']
            # PI mapping (different from Quotation):
            #   product_name        = client brand name (Product Details col)
            #   description_of_goods = company product name (Description col)
            ProformaInvoiceItem.objects.create(
                pi=pi,
                product_name=line['client_product_name'] or line['product_name'],
                client_product_name=line['client_product_name'],
                description_of_goods=line['product_name'],
                packages_description=line['description'],
                quantity=qty,
                unit=line['unit'] or 'Ltrs',
                unit_price=price,
                total_price=qty * price,
            )
            # Update PI total
            pi.total = qty * price
            pi.save(update_fields=['total'])
        else:
            ProformaInvoiceItem.objects.create(
                pi=pi, product_name='',
                quantity=0, unit='Ltrs', unit_price=0, total_price=0,
            )

        return Response(ProformaInvoiceSerializer(pi).data, status=status.HTTP_201_CREATED)


class CommercialInvoiceViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = CommercialInvoiceSerializer
    filterset_fields = ['client', 'order', 'status']

    def get_queryset(self):
        qs = CommercialInvoice.objects.filter(is_deleted=False).select_related('client', 'order').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    @action(detail=True, methods=['post'], url_path='save-with-items')
    def save_with_items(self, request, pk=None):
        """Save CI fields + replace all items in one request."""
        from .models import CommercialInvoiceItem
        ci = self.get_object()
        data = dict(request.data)
        items_data = data.pop('items', None)

        allowed = {
            'invoice_date', 'status', 'exporter_ref',
            'client_company_name', 'client_tax_number', 'client_address',
            'client_pincode', 'client_city_state_country', 'client_phone',
            'notify_company_name', 'notify_address', 'notify_phone',
            'buyer_order_no', 'buyer_order_date',
            'country_of_origin', 'country_of_final_destination',
            'port_of_loading', 'port_of_discharge', 'vessel_flight_no',
            'final_destination', 'pre_carriage_by', 'place_of_receipt',
            'terms_of_delivery', 'terms_of_trade', 'payment_terms',
            'currency', 'exchange_rate', 'batch_no', 'freight', 'insurance',
            'total_fob_usd', 'total_fob_inr', 'freight_inr', 'insurance_inr',
            'total_invoice_usd', 'total_invoice_inr',
            'igst_rate', 'igst_amount', 'grand_total_inr',
            'amount_in_words', 'bank_details', 'display_overrides',
        }
        for field in allowed:
            if field in data:
                val = data[field]
                if val == '' and field in ('exchange_rate', 'freight', 'insurance', 'igst_rate',
                                           'igst_amount', 'grand_total_inr', 'total_fob_usd',
                                           'total_fob_inr', 'freight_inr', 'insurance_inr',
                                           'total_invoice_usd', 'total_invoice_inr'):
                    val = 0
                setattr(ci, field, val)

        if items_data is not None:
            ci.items.all().delete()
            total = 0
            for item_data in items_data:
                qty = float(item_data.get('quantity', 0) or 0)
                price = float(item_data.get('unit_price', 0) or 0)
                line_total = qty * price
                total += line_total
                CommercialInvoiceItem.objects.create(
                    ci=ci,
                    product_name=item_data.get('product_name', ''),
                    hsn_code=item_data.get('hsn_code', ''),
                    packages_description=item_data.get('packages_description', ''),
                    description_of_goods=item_data.get('description_of_goods', ''),
                    quantity=qty,
                    unit=item_data.get('unit', 'KG'),
                    unit_price=price,
                    total_price=line_total,
                )
            ci.total_fob_usd = total
            ci.total_invoice_usd = total + float(ci.freight or 0) + float(ci.insurance or 0)
        # Keep the deprecated mirror in sync — both fields hold the same
        # value so older readers (PDFs, exports) keep working until fully
        # migrated to terms_of_trade.
        if 'terms_of_trade' in data:
            ci.payment_terms = ci.terms_of_trade
        elif 'payment_terms' in data:
            ci.terms_of_trade = ci.payment_terms
        ci.save()
        # Push CI's terms_of_trade back to the source Order so the Payment
        # Tracking card on the order reflects whatever is in the CI.
        if ci.order_id and ci.terms_of_trade and ci.terms_of_trade != (ci.order.payment_terms or ''):
            ci.order.payment_terms = ci.terms_of_trade
            ci.order.save(update_fields=['payment_terms'])
        return Response(CommercialInvoiceSerializer(ci).data)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        """Create a CI from an order, auto-filling client data."""
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        from orders.models import Order
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        from .ci_service import create_ci_from_order
        ci = create_ci_from_order(order, request.user)
        # Mirror the CI total into Finance > Payments as a placeholder
        # entry so the receivable shows up in the payments list. The
        # reference string carries the CI number so the row is linkable
        # back to the invoice. Idempotent — re-running won't duplicate.
        try:
            from .models import Payment
            from datetime import date
            ci_total = ci.total_invoice_usd or ci.grand_total_inr or 0
            ref = f'CI {ci.invoice_number}'
            if ci_total and not Payment.objects.filter(reference=ref).exists():
                Payment.objects.create(
                    invoice=None,
                    client=ci.client,
                    amount=ci_total,
                    currency=ci.currency or 'USD',
                    payment_date=date.today(),
                    mode=Payment.Mode.TT,
                    reference=ref,
                    notes=f'Auto-created from Commercial Invoice {ci.invoice_number}',
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f'Could not auto-create Payment for CI {ci.id}: {e}'
            )
        return Response(CommercialInvoiceSerializer(ci).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        """Generate CI PDF, save it to the order's documents, and return inline."""
        from django.core.files.base import ContentFile
        from orders.models import OrderDocument
        ci = self.get_object()
        from .ci_service import generate_ci_pdf
        pdf_buffer = generate_ci_pdf(ci)
        filename = f'CI_{ci.invoice_number.replace("/", "-")}.pdf'
        if ci.order_id:
            OrderDocument.objects.filter(order_id=ci.order_id, doc_type='client_invoice', is_deleted=False).delete()
            OrderDocument.objects.create(
                order_id=ci.order_id, doc_type='client_invoice', name=filename,
                file=ContentFile(pdf_buffer.getvalue(), name=filename), uploaded_by=request.user,
            )
            pdf_buffer.seek(0)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        """Generate PDF and send to client via email."""
        ci = self.get_object()
        from .ci_service import send_ci_email
        try:
            sent_to = send_ci_email(ci, request.user)
            notify(
                title=f'CI {ci.invoice_number} sent to {ci.client.company_name}',
                message=f'{request.user.full_name} sent commercial invoice to {sent_to}.',
                notification_type='system', link='/finance',
                actor=request.user, client=ci.client,
            )
            return Response({'status': 'sent', 'sent_to': sent_to})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class LogisticsInvoiceViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = LogisticsInvoiceSerializer
    filterset_fields = ['client', 'order', 'status']

    def get_queryset(self):
        qs = LogisticsInvoice.objects.filter(is_deleted=False).select_related('client', 'order').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    @action(detail=True, methods=['post'], url_path='save-with-items')
    def save_with_items(self, request, pk=None):
        from .models import LogisticsInvoiceItem
        li = self.get_object()
        data = dict(request.data)
        items_data = data.pop('items', None)
        allowed = {
            'invoice_date', 'status', 'exporter_ref', 'client_company_name', 'client_tax_number',
            'client_address', 'client_pincode', 'client_city_state_country', 'client_phone',
            'notify_company_name', 'notify_address', 'notify_phone',
            'country_of_origin', 'country_of_final_destination', 'port_of_loading', 'port_of_discharge',
            'vessel_flight_no', 'final_destination', 'terms_of_delivery', 'payment_terms',
            'buyer_reference', 'exchange_rate', 'currency', 'freight', 'insurance', 'discount',
            'igst_rate', 'shipping_forwarding', 'amount_in_words', 'bank_details', 'display_overrides',
        }
        for field in allowed:
            if field in data:
                val = data[field]
                if val == '' and field in ('exchange_rate', 'freight', 'insurance', 'discount', 'igst_rate', 'shipping_forwarding'):
                    val = 0
                setattr(li, field, val)
        if items_data is not None:
            li.items.all().delete()
            total_usd = 0
            xrate = float(li.exchange_rate) if li.exchange_rate else 0
            for item_data in items_data:
                qty = float(item_data.get('quantity', 0) or 0)
                price = float(item_data.get('unit_price', 0) or 0)
                amt_usd = qty * price
                LogisticsInvoiceItem.objects.create(
                    li=li, product_name=item_data.get('product_name', ''),
                    packages_description=item_data.get('packages_description', ''),
                    description_of_goods=item_data.get('description_of_goods', ''),
                    quantity=qty, unit=item_data.get('unit', 'Kg'),
                    unit_price=price, amount_usd=amt_usd, amount_inr=amt_usd * xrate,
                )
                total_usd += amt_usd
            li.total_fob_usd = total_usd
            li.subtotal_usd = total_usd
            li.subtotal_inr = total_usd * xrate
        li.save()
        return Response(LogisticsInvoiceSerializer(li).data)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        from orders.models import Order
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        from .li_service import create_li_from_order
        li = create_li_from_order(order, request.user)
        return Response(LogisticsInvoiceSerializer(li).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        from django.core.files.base import ContentFile
        from orders.models import OrderDocument
        li = self.get_object()
        from .li_service import generate_li_pdf
        pdf_buffer = generate_li_pdf(li)
        filename = f'LI_{li.invoice_number.replace("/", "-")}.pdf'
        if li.order_id:
            OrderDocument.objects.filter(order_id=li.order_id, doc_type='logistic_invoice', is_deleted=False).delete()
            OrderDocument.objects.create(
                order_id=li.order_id, doc_type='logistic_invoice', name=filename,
                file=ContentFile(pdf_buffer.getvalue(), name=filename), uploaded_by=request.user,
            )
            pdf_buffer.seek(0)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        li = self.get_object()
        from .li_service import send_li_email
        try:
            sent_to = send_li_email(li, request.user)
            notify(
                title=f'LI {li.invoice_number} sent to {li.client.company_name}',
                message=f'{request.user.full_name} sent logistics invoice to {sent_to}.',
                notification_type='system', link='/finance',
                actor=request.user, client=li.client,
            )
            return Response({'status': 'sent', 'sent_to': sent_to})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class PackingInstructionFormViewSet(viewsets.ModelViewSet):
    serializer_class = PackingInstructionFormSerializer
    filterset_fields = ['order', 'order_item', 'client']

    def get_queryset(self):
        qs = PackingInstructionForm.objects.select_related('order', 'order_item', 'client').all()
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='create-from-order-item')
    def create_from_order_item(self, request):
        from orders.models import OrderItem
        order_item_id = request.data.get('order_item_id')
        if not order_item_id:
            return Response({'error': 'order_item_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            oi = OrderItem.objects.select_related('order', 'order__client').get(id=order_item_id)
        except OrderItem.DoesNotExist:
            return Response({'error': 'Order item not found'}, status=status.HTTP_404_NOT_FOUND)
        existing = PackingInstructionForm.objects.filter(order_item=oi).first()
        if existing:
            return Response(PackingInstructionFormSerializer(existing).data)
        from .pif_service import create_pif_from_order_item
        pif = create_pif_from_order_item(oi, request.user)
        return Response(PackingInstructionFormSerializer(pif).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='status-for-order')
    def status_for_order(self, request):
        """Return PIF status per order line. Used by the workflow gate/UI."""
        from orders.models import Order, OrderItem
        order_id = request.query_params.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        items = order.items.all()
        result = []
        for it in items:
            pif = PackingInstructionForm.objects.filter(order_item=it).first()
            result.append({
                'order_item_id': it.id,
                'product_name': it.product_name,
                'client_product_name': it.client_product_name,
                'quantity': str(it.quantity),
                'unit': it.unit,
                'pif_id': str(pif.id) if pif else None,
                'pif_number': pif.pif_number if pif else None,
                'has_pdf': bool(pif and pif.pdf_file),
            })
        all_ready = all(r['has_pdf'] for r in result) if result else False
        return Response({'items': result, 'all_ready': all_ready, 'count': len(result)})

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        """Generate and persist the PIF PDF, attach to the order's documents, return inline."""
        from django.core.files.base import ContentFile
        from orders.models import OrderDocument
        pif = self.get_object()
        from .pif_service import generate_pif_pdf
        pdf_buffer = generate_pif_pdf(pif)
        filename = f'{pif.pif_number}.pdf'

        # Save/overwrite pdf_file on the PIF
        pif.pdf_file.save(filename, ContentFile(pdf_buffer.getvalue()), save=True)

        # Mirror into the order's Documents tab (remove older PDF for the same PIF, then add fresh)
        OrderDocument.objects.filter(order=pif.order, doc_type='pif', name=filename).delete()
        OrderDocument.objects.create(
            order=pif.order, doc_type='pif', name=filename,
            file=pif.pdf_file, uploaded_by=request.user,
        )

        pdf_buffer.seek(0)
        response = HttpResponse(pdf_buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @action(detail=False, methods=['post'], url_path='upload-for-order-item')
    def upload_for_order_item(self, request):
        """Attach a pre-existing PIF PDF to an order line in one shot.

        Body (multipart): order_item_id, file
        Creates the PIF row if missing, stores the uploaded file as its
        ``pdf_file`` (so ``has_pdf=True`` and the workflow gate is satisfied),
        and mirrors the file into the order's Documents tab.
        """
        from django.core.files.base import ContentFile
        from orders.models import OrderItem, OrderDocument
        order_item_id = request.data.get('order_item_id')
        upload = request.FILES.get('file')
        if not order_item_id:
            return Response({'error': 'order_item_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not upload:
            return Response({'error': 'file is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            oi = OrderItem.objects.select_related('order', 'order__client').get(id=order_item_id)
        except OrderItem.DoesNotExist:
            return Response({'error': 'Order item not found'}, status=status.HTTP_404_NOT_FOUND)

        pif = PackingInstructionForm.objects.filter(order_item=oi).first()
        if not pif:
            from .pif_service import create_pif_from_order_item
            pif = create_pif_from_order_item(oi, request.user)

        content = upload.read()
        ext = (upload.name or 'pdf').rsplit('.', 1)[-1].lower() or 'pdf'
        filename = f'{pif.pif_number}.{ext}'
        pif.pdf_file.save(filename, ContentFile(content), save=True)

        # Mirror into the order's Documents tab; replace any prior PIF doc
        # for this PIF number so re-uploading is idempotent.
        OrderDocument.objects.filter(
            order=pif.order, doc_type='pif', name__startswith=pif.pif_number,
        ).delete()
        OrderDocument.objects.create(
            order=pif.order, doc_type='pif', name=filename,
            file=pif.pdf_file, uploaded_by=request.user,
        )
        return Response(PackingInstructionFormSerializer(pif).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='replace-pdf')
    def replace_pdf(self, request, pk=None):
        """Replace the PIF's PDF with an uploaded file. Mirrors the file into
        the order's Documents tab, replacing any prior PIF doc with this name."""
        from django.core.files.base import ContentFile
        from orders.models import OrderDocument
        pif = self.get_object()
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'File is required'}, status=status.HTTP_400_BAD_REQUEST)
        content = upload.read()
        ext = (upload.name or 'pdf').rsplit('.', 1)[-1].lower() or 'pdf'
        filename = f'{pif.pif_number}.{ext}'
        pif.pdf_file.save(filename, ContentFile(content), save=True)
        # Mirror into Documents tab, replacing any prior entry for this PIF
        OrderDocument.objects.filter(order=pif.order, doc_type='pif', name__startswith=pif.pif_number).delete()
        OrderDocument.objects.create(
            order=pif.order, doc_type='pif', name=filename,
            file=pif.pdf_file, uploaded_by=request.user,
        )
        return Response(PackingInstructionFormSerializer(pif).data)

    @action(detail=False, methods=['post'], url_path='attach-all-to-email')
    def attach_all_to_email(self, request):
        """Build / refresh an email draft on the order's email thread with all
        generated PIFs for that order attached. Mirrors the dispatch / transit
        flow: stamps `editor_data.auto_actions` so post-send auto-handles, and
        re-uses any existing draft we previously stamped for this order."""
        from communications.models import Communication, EmailDraft, DraftAttachment
        from django.core.files.base import ContentFile
        from django.db.models import Q
        from orders.models import Order

        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        pifs = list(PackingInstructionForm.objects.filter(order=order).order_by('created_at'))
        if not pifs:
            return Response({'error': 'No PIFs generated for this order yet.'}, status=status.HTTP_400_BAD_REQUEST)
        # All PIFs must have a generated PDF before attaching
        missing = [p for p in pifs if not p.pdf_file]
        if missing:
            return Response({
                'error': 'Some PIFs have no generated PDF yet — open each and click "Save & Generate PDF" first.',
                'missing': [str(p.id) for p in missing],
            }, status=status.HTTP_400_BAD_REQUEST)

        # Resolve the same email thread as dispatch / transit
        comm = None
        pi_with_src = ProformaInvoice.objects.filter(
            order=order, source_communication__isnull=False,
        ).order_by('-created_at').first()
        if pi_with_src and pi_with_src.source_communication_id:
            comm = Communication.objects.filter(id=pi_with_src.source_communication_id, is_deleted=False).first()
        if not comm:
            product_names = [it.product_name for it in order.items.all() if it.product_name]
            if product_names:
                product_q = Q()
                for name in product_names:
                    product_q |= Q(subject__icontains=name) | Q(body__icontains=name)
                comm = Communication.objects.filter(
                    client=order.client, comm_type='email', direction='inbound', is_deleted=False,
                ).filter(product_q).order_by('-created_at').first()
        if not comm and order.order_number:
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', is_deleted=False,
            ).filter(Q(subject__icontains=order.order_number) | Q(body__icontains=order.order_number)).order_by('-created_at').first()
        if not comm:
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', direction='inbound', is_deleted=False,
            ).order_by('-created_at').first()
        if not comm:
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', is_deleted=False,
            ).order_by('-created_at').first()

        client_name = order.client.company_name if order.client else 'Valued Customer'
        product_lines = ', '.join([(it.product_name or '') for it in order.items.all() if it.product_name])
        ai_subject = f'Re: {comm.subject}' if comm and comm.subject else 'Packing Instructions Form'
        ai_body = (
            f'<p>Dear {client_name},</p>'
            f'<p>Please find attached the <strong>Packing Instructions Form (PIF)</strong> for your '
            f'order containing <strong>{product_lines or "—"}</strong>. Kindly review and confirm so we '
            f'can proceed with production accordingly.</p>'
            f'<p>Should you require any clarification or changes, please do not hesitate to reach out.</p>'
            f'<p>Best regards,<br/>{getattr(request.user, "full_name", "") or request.user.username}</p>'
        )

        # Resolve recipient
        to_email = ''
        if comm and getattr(comm, 'external_email', ''):
            to_email = comm.external_email
        if not to_email:
            from clients.models import Contact
            primary = Contact.objects.filter(client=order.client, is_primary=True).first() \
                or Contact.objects.filter(client=order.client).first()
            if primary and primary.email:
                to_email = primary.email

        # Re-use a draft we previously stamped for THIS order's PIF flow
        draft = None
        if comm:
            for cand in EmailDraft.objects.filter(communication=comm, status='draft').order_by('-updated_at'):
                actions = (cand.editor_data or {}).get('auto_actions') or []
                if any(a.get('type') == 'pif_attached' and a.get('order_id') == str(order.id) for a in actions):
                    draft = cand
                    break
        if not draft:
            draft = EmailDraft.objects.create(
                communication=comm,
                to_email=to_email or '',
                subject=ai_subject,
                body=ai_body,
                cc='', status='draft',
                created_by=request.user, edited_by=request.user,
            )
        # Always overwrite content
        draft.to_email = to_email or draft.to_email
        draft.subject = ai_subject
        draft.body = ai_body
        draft.edited_by = request.user
        draft.save(update_fields=['to_email', 'subject', 'body', 'edited_by'])

        # Stamp metadata so the post-send hook ignores attachment-name parsing here
        ed = dict(draft.editor_data or {})
        actions = list(ed.get('auto_actions') or [])
        actions = [a for a in actions if not (a.get('type') == 'pif_attached' and a.get('order_id') == str(order.id))]
        actions.append({'type': 'pif_attached', 'order_id': str(order.id)})
        ed['auto_actions'] = actions
        draft.editor_data = ed
        draft.save(update_fields=['editor_data'])

        # Replace any prior PIF_ attachments and re-attach every PIF
        DraftAttachment.objects.filter(draft=draft, filename__startswith='PIF_').delete()
        for pif in pifs:
            try:
                pif.pdf_file.open('rb')
                content = pif.pdf_file.read()
                pif.pdf_file.close()
            except Exception:
                continue
            filename = f'PIF_{pif.pif_number}.pdf'
            att = DraftAttachment(draft=draft, filename=filename, file_size=len(content))
            att.file.save(filename, ContentFile(content), save=True)

        return Response({
            'draft_id': str(draft.id),
            'communication_id': str(comm.id) if comm else None,
            'pif_count': len(pifs),
        })


class ComplianceDocumentViewSet(viewsets.ModelViewSet):
    """Covers DBK Declaration / Examination Report / Export Declaration / Factory Stuffing."""
    serializer_class = ComplianceDocumentSerializer
    filterset_fields = ['order', 'client', 'doc_type']

    DOC_TYPE_TO_ORDER_DOC_TYPE = {
        'examination_report': 'examination_report',
        'dbk_declaration': 'dbk_declaration',
        'export_declaration': 'export_declaration',
        'factory_stuffing': 'factory_stuffing',
        'non_dg_declaration': 'non_dg_declaration',
    }

    def get_queryset(self):
        return ComplianceDocument.objects.select_related('order', 'client').all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        from orders.models import Order
        order_id = request.data.get('order_id')
        doc_type = request.data.get('doc_type')
        if not order_id or doc_type not in self.DOC_TYPE_TO_ORDER_DOC_TYPE:
            return Response({'error': 'order_id and valid doc_type are required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        from .compliance_service import create_compliance_doc_from_order
        doc = create_compliance_doc_from_order(order, doc_type, request.user)
        return Response(ComplianceDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        from django.core.files.base import ContentFile
        from orders.models import OrderDocument
        doc = self.get_object()
        from .compliance_service import generate_compliance_pdf
        pdf_buffer = generate_compliance_pdf(doc)
        filename = f'{doc.doc_type}_{doc.order.order_number}.pdf'
        doc.pdf_file.save(filename, ContentFile(pdf_buffer.getvalue()), save=True)
        order_doc_type = self.DOC_TYPE_TO_ORDER_DOC_TYPE[doc.doc_type]
        OrderDocument.objects.filter(order=doc.order, doc_type=order_doc_type, is_deleted=False).delete()
        OrderDocument.objects.create(
            order=doc.order, doc_type=order_doc_type, name=filename,
            file=doc.pdf_file, uploaded_by=request.user,
        )
        pdf_buffer.seek(0)
        response = HttpResponse(pdf_buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response


class PackingListViewSet(viewsets.ModelViewSet):
    serializer_class = PackingListSerializer
    filterset_fields = ['order', 'client', 'list_type']

    def get_queryset(self):
        return PackingList.objects.select_related('order', 'client').all()

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        from orders.models import Order
        order_id = request.data.get('order_id')
        list_type = request.data.get('list_type')
        if not order_id or list_type not in ('client', 'logistic'):
            return Response({'error': 'order_id and list_type (client|logistic) are required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        from .packing_list_service import create_packing_list_from_order
        pl = create_packing_list_from_order(order, list_type, request.user)
        return Response(PackingListSerializer(pl).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        from django.core.files.base import ContentFile
        from orders.models import OrderDocument
        pl = self.get_object()
        from .packing_list_service import generate_packing_list_pdf
        pdf_buffer = generate_packing_list_pdf(pl)
        filename = f'{pl.invoice_number}.pdf'
        pl.pdf_file.save(filename, ContentFile(pdf_buffer.getvalue()), save=True)

        # Persist into the order's Documents tab under the correct doc_type
        doc_type = 'client_packing_list' if pl.list_type == 'client' else 'logistic_packing_list'
        OrderDocument.objects.filter(order=pl.order, doc_type=doc_type, is_deleted=False).delete()
        OrderDocument.objects.create(
            order=pl.order, doc_type=doc_type, name=filename,
            file=pl.pdf_file, uploaded_by=request.user,
        )
        pdf_buffer.seek(0)
        response = HttpResponse(pdf_buffer.getvalue(), content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response
