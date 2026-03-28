from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Q
from .models import Inquiry, Quotation, QuotationItem
from .serializers import InquirySerializer, QuotationSerializer, QuotationCreateSerializer
from orders.models import Order, OrderItem
from finance.models import Invoice

class InquiryViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = InquirySerializer
    filterset_fields = ['client', 'stage', 'source', 'assigned_to']
    search_fields = ['product_name', 'requirements']
    def get_queryset(self):
        qs = Inquiry.objects.filter(is_deleted=False).select_related('client', 'assigned_to', 'product')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(Q(client__in=client_ids) | Q(assigned_to=user))
        return qs
    def perform_create(self, serializer):
        inquiry = serializer.save()
        if not inquiry.assigned_to:
            inquiry.assigned_to = self.request.user
            inquiry.save()
        from tasks.models import Task
        from notifications.models import Notification
        assigned_user = inquiry.assigned_to or self.request.user
        Task.objects.create(
            title=f'Follow up on inquiry from {inquiry.client.company_name}',
            client=inquiry.client, owner=assigned_user,
            created_by=self.request.user, priority='high', is_auto_generated=True,
            linked_type='inquiry', linked_id=inquiry.id
        )
        # Notify the assigned executive about the new inquiry
        Notification.objects.create(
            user=assigned_user,
            notification_type='task',
            title=f'New inquiry assigned: {inquiry.client.company_name}',
            message=f'A new inquiry from {inquiry.client.company_name} for {inquiry.product_name or "N/A"} has been assigned to you. A follow-up task has been created.',
            link=f'/quotations/inquiries/{inquiry.id}',
        )

    @action(detail=True, methods=['post'])
    def advance(self, request, pk=None):
        inquiry = self.get_object()
        stage_order = ['inquiry', 'discussion', 'sample', 'quotation', 'negotiation', 'order_confirmed']

        new_stage = request.data.get('stage')
        if not new_stage:
            try:
                current_idx = stage_order.index(inquiry.stage)
                if current_idx < len(stage_order) - 1:
                    new_stage = stage_order[current_idx + 1]
                else:
                    return Response({'error': 'Already at final stage'}, status=status.HTTP_400_BAD_REQUEST)
            except ValueError:
                return Response({'error': 'Invalid current stage'}, status=status.HTTP_400_BAD_REQUEST)

        old_stage = inquiry.stage
        inquiry.stage = new_stage
        inquiry.save()

        # Auto-create tasks and notifications based on stage
        from notifications.models import Notification
        from tasks.models import Task

        assigned = inquiry.assigned_to or (inquiry.client.primary_executive if inquiry.client else None)
        client_name = inquiry.client.company_name if inquiry.client else 'Unknown'

        if new_stage == 'discussion' and assigned:
            Task.objects.create(
                title=f'Follow up with {client_name} on inquiry',
                description=f'Client showed interest. Discuss product requirements, pricing, and terms.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='medium',
            )

        elif new_stage == 'sample' and assigned:
            Task.objects.create(
                title=f'Arrange sample for {client_name}',
                description=f'Product: {inquiry.product_name or "TBD"}. Prepare and dispatch sample.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='high',
            )

        elif new_stage == 'quotation' and assigned:
            Task.objects.create(
                title=f'Prepare quotation for {client_name}',
                description=f'Product: {inquiry.product_name or "TBD"}. Create quotation in Quotations page.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='high',
            )

        elif new_stage == 'negotiation' and assigned:
            Task.objects.create(
                title=f'Negotiate terms with {client_name}',
                description=f'Client is negotiating. Review pricing and terms.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='high',
            )

        elif new_stage == 'order_confirmed' and assigned:
            Task.objects.create(
                title=f'Create order for {client_name}',
                description=f'Order confirmed! Go to Quotations > Convert to Order.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='urgent',
            )

        # Notify assigned executive
        if assigned and assigned != request.user:
            Notification.objects.create(
                user=assigned,
                notification_type='task',
                title=f'Pipeline: {client_name} → {new_stage.replace("_", " ").title()}',
                message=f'Inquiry for {client_name} moved from "{old_stage}" to "{new_stage.replace("_", " ")}". Check your tasks.',
                link='/pipeline',
            )

        return Response(InquirySerializer(inquiry).data)

class QuotationViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    filterset_fields = ['client', 'status']
    search_fields = ['quotation_number']
    def get_queryset(self):
        qs = Quotation.objects.filter(is_deleted=False).select_related('client', 'created_by', 'approved_by').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(Q(client__in=client_ids) | Q(created_by=user))
        return qs
    def get_serializer_class(self):
        if self.action in ['create']:
            return QuotationCreateSerializer
        return QuotationSerializer

    @action(detail=False, methods=['post'], url_path='create-blank')
    def create_blank(self, request):
        """Create a blank quotation for a client."""
        client_id = request.data.get('client_id')
        if not client_id:
            return Response({'error': 'client_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        from clients.models import Client
        try:
            client = Client.objects.get(id=client_id)
        except Client.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)

        from .models import generate_quotation_number
        q = Quotation.objects.create(
            quotation_number=generate_quotation_number(),
            client=client,
            currency=client.preferred_currency or 'USD',
            delivery_terms='FOB',
            country_of_origin='India',
            country_of_final_destination=client.country or '',
            created_by=request.user,
        )
        # Add one blank item
        QuotationItem.objects.create(
            quotation=q,
            product_name='',
            description='',
            quantity=0,
            unit='KG',
            unit_price=0,
            total_price=0,
        )
        return Response(QuotationSerializer(q).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='save-with-items')
    def save_with_items(self, request, pk=None):
        """Save quotation fields + replace all items in one request."""
        q = self.get_object()
        data = dict(request.data)
        items_data = data.pop('items', None)

        # Fields that can be updated on Quotation
        allowed = {
            'currency', 'delivery_terms', 'payment_terms', 'payment_terms_detail',
            'freight_terms', 'country_of_origin', 'country_of_final_destination',
            'port_of_loading', 'port_of_discharge', 'vessel_flight_no',
            'final_destination', 'packaging_details', 'validity_days', 'notes',
        }
        for field in allowed:
            if field in data:
                setattr(q, field, data[field])

        # Replace items
        if items_data is not None:
            q.items.all().delete()
            total = 0
            for item_data in items_data:
                qty = float(item_data.get('quantity', 0) or 0)
                price = float(item_data.get('unit_price', 0) or 0)
                line_total = qty * price
                total += line_total
                QuotationItem.objects.create(
                    quotation=q,
                    product_name=item_data.get('product_name', ''),
                    description=item_data.get('description', ''),
                    quantity=qty,
                    unit=item_data.get('unit', 'KG'),
                    unit_price=price,
                    total_price=line_total,
                )
            q.subtotal = total
            q.total = total

        q.save()
        return Response(QuotationSerializer(q).data)

    @action(detail=True, methods=['post'])
    def submit_for_approval(self, request, pk=None):
        q = self.get_object()
        q.status = 'pending_approval'
        q.save()
        return Response(QuotationSerializer(q).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        q = self.get_object()
        if request.user.role not in ['admin', 'manager']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        q.status = 'approved'
        q.approved_by = request.user
        q.approved_at = timezone.now()
        q.save()
        # Notify the quotation creator that their quote has been approved
        from notifications.models import Notification
        if q.created_by and q.created_by != request.user:
            Notification.objects.create(
                user=q.created_by,
                notification_type='approval',
                title=f'Quotation {q.quotation_number} approved',
                message=f'Your quotation {q.quotation_number} for {q.client.company_name} has been approved by {request.user.full_name}.',
                link=f'/quotations/{q.id}',
            )
        return Response(QuotationSerializer(q).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        q = self.get_object()
        q.status = 'rejected'
        q.save()
        return Response(QuotationSerializer(q).data)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        """Create a Quotation from an order, auto-filling client/items."""
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        from .models import generate_quotation_number
        total = sum(i.total_price for i in order.items.all())
        client = order.client
        q = Quotation.objects.create(
            quotation_number=generate_quotation_number(),
            client=client,
            currency=order.currency,
            delivery_terms=order.delivery_terms or 'FOB',
            payment_terms=order.payment_terms if order.payment_terms in dict(Quotation.PAYMENT_CHOICES) else 'advance',
            freight_terms=order.freight_terms if order.freight_terms in dict(Quotation.FREIGHT_CHOICES) else 'sea_fcl',
            country_of_origin='India',
            country_of_final_destination=client.country or '',
            subtotal=total,
            total=total,
            created_by=request.user,
        )
        for item in order.items.all():
            QuotationItem.objects.create(
                quotation=q,
                product=item.product,
                product_name=item.product_name,
                description=item.description or '',
                quantity=item.quantity,
                unit=item.unit,
                unit_price=item.unit_price,
                total_price=item.total_price,
            )
        return Response(QuotationSerializer(q).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        """Generate and return Quotation PDF."""
        q = self.get_object()
        from .quotation_service import generate_quotation_pdf
        pdf_buffer = generate_quotation_pdf(q)
        client_name = q.client.company_name if q.client else 'Client'
        filename = f'Quotation_{q.quotation_number.replace("/", "-")}_{client_name.replace(" ", "_")}.pdf'
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'])
    def generate_pi(self, request, pk=None):
        """Generate a Proforma Invoice from an approved quotation."""
        q = self.get_object()
        if q.status not in ['approved', 'sent']:
            return Response({'error': 'Quotation must be approved first'}, status=status.HTTP_400_BAD_REQUEST)

        from finance.models import Invoice, InvoiceItem

        # Default bank details (can be made configurable via settings)
        default_bank_details = (
            "Bank Name: State Bank of India\n"
            "Account Name: Kriya Global Trade Pvt Ltd\n"
            "Account Number: 39876543210\n"
            "IFSC Code: SBIN0001234\n"
            "SWIFT Code: SBININBB\n"
            "Branch: Export Division, Mumbai"
        )

        inv_count = Invoice.objects.count() + 1
        pi = Invoice.objects.create(
            invoice_number=f'PI-{inv_count:05d}',
            quotation=q,
            client=q.client,
            invoice_type='proforma',
            currency=q.currency,
            delivery_terms=q.delivery_terms,
            payment_terms=q.notes.split('\n')[0].replace('Payment Terms: ', '') if q.notes.startswith('Payment Terms:') else 'TT 30 days',
            validity=f'{q.validity_days} days',
            subtotal=q.subtotal,
            tax=0,
            total=q.total,
            bank_details=default_bank_details,
            notes=f'Generated from quotation {q.quotation_number}',
            created_by=request.user,
        )

        # Copy line items from quotation to PI
        for qi in q.items.all():
            InvoiceItem.objects.create(
                invoice=pi,
                product_name=qi.product_name,
                description=qi.description,
                quantity=qi.quantity,
                unit=qi.unit,
                unit_price=qi.unit_price,
                total_price=qi.total_price,
            )

        # Update quotation status to sent
        q.status = 'sent'
        q.save()

        from notifications.models import Notification
        if q.created_by:
            Notification.objects.create(
                user=q.created_by,
                notification_type='system',
                title=f'Proforma Invoice {pi.invoice_number} generated',
                message=f'PI {pi.invoice_number} has been generated from quotation {q.quotation_number} for {q.client.company_name}.',
                link=f'/finance/invoices/{pi.id}',
            )

        from finance.serializers import InvoiceSerializer
        return Response(InvoiceSerializer(pi).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def convert_to_order(self, request, pk=None):
        q = self.get_object()
        if q.status != 'approved':
            return Response({'error': 'Must be approved first'}, status=status.HTTP_400_BAD_REQUEST)
        order_count = Order.objects.count() + 1
        order = Order.objects.create(
            order_number=f'ORD-{order_count:05d}',
            client=q.client, quotation=q, currency=q.currency,
            delivery_terms=q.delivery_terms, total=q.total, created_by=request.user,
            payment_terms=q.payment_terms or q.payment_terms_detail or '',
            freight_terms=q.freight_terms or '',
        )
        for qi in q.items.all():
            OrderItem.objects.create(
                order=order, product=qi.product, product_name=qi.product_name,
                description=qi.description, quantity=qi.quantity, unit=qi.unit,
                unit_price=qi.unit_price, total_price=qi.total_price
            )
        q.status = 'accepted'
        q.save()
        if q.inquiry:
            q.inquiry.stage = 'order_confirmed'
            q.inquiry.save()
        inv_count = Invoice.objects.count() + 1
        pi = Invoice.objects.create(
            invoice_number=f'PI-{inv_count:05d}', order=order, client=q.client,
            invoice_type='proforma', currency=q.currency, subtotal=q.subtotal,
            total=q.total, created_by=request.user
        )
        # Create a Document record for the Proforma Invoice
        from documents.models import Document
        Document.objects.create(
            client=q.client,
            order=order,
            name=f'Proforma Invoice - {pi.invoice_number}',
            category='financial',
            file=f'documents/auto/PI-{pi.invoice_number}.pdf',
            filename=f'PI-{pi.invoice_number}.pdf',
            mime_type='application/pdf',
            file_size=0,
            uploaded_by=request.user,
        )
        # Notify the quotation creator about the order conversion
        from notifications.models import Notification
        if q.created_by:
            Notification.objects.create(
                user=q.created_by,
                notification_type='system',
                title=f'Order {order.order_number} created from {q.quotation_number}',
                message=f'Quotation {q.quotation_number} has been converted to order {order.order_number}. Proforma Invoice {pi.invoice_number} has been generated.',
                link=f'/orders/{order.id}',
            )
        return Response({'order_id': str(order.id), 'order_number': order.order_number}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='send-to-client')
    def send_to_client(self, request, pk=None):
        """Send quotation/PI to client via email or WhatsApp."""
        q = self.get_object()
        send_via = request.data.get('send_via', 'email')  # email or whatsapp
        include_pi = request.data.get('include_pi', False)

        if q.status not in ['approved', 'sent', 'pending_approval', 'draft']:
            return Response({'error': 'Quotation cannot be sent in this status'}, status=status.HTTP_400_BAD_REQUEST)

        # Get client's primary contact
        contact = q.client.contacts.filter(is_deleted=False).order_by('-is_primary', 'name').first()
        if not contact:
            return Response({'error': 'Client has no contacts. Add a contact first.'}, status=status.HTTP_400_BAD_REQUEST)

        if send_via == 'email':
            contact_email = contact.email
            if not contact_email:
                return Response({'error': f'Contact {contact.name} has no email address.'}, status=status.HTTP_400_BAD_REQUEST)

            from communications.models import EmailAccount
            email_account = EmailAccount.objects.filter(user=request.user, is_active=True).first()
            if not email_account:
                email_account = EmailAccount.objects.filter(is_active=True).first()
            if not email_account:
                return Response({'error': 'No email account configured. Go to Settings > Email Accounts.'}, status=status.HTTP_400_BAD_REQUEST)

            # Build email
            items_html = ''
            for i, item in enumerate(q.items.all(), 1):
                details = item.description if item.description else f'{item.quantity:,.0f} {item.unit}'
                items_html += f'<tr><td style="padding:8px;border:1px solid #eee;">{i}</td><td style="padding:8px;border:1px solid #eee;">{item.product_name}</td><td style="padding:8px;border:1px solid #eee;">{details}</td><td style="padding:8px;border:1px solid #eee;text-align:right;">{q.currency} {item.unit_price:,.2f}</td><td style="padding:8px;border:1px solid #eee;text-align:right;">{q.currency} {item.total_price:,.2f}</td></tr>'

            payment_display = q.payment_terms_detail or (q.get_payment_terms_display() if q.payment_terms else 'As agreed')
            delivery_display = q.get_delivery_terms_display() if q.delivery_terms else ''

            body_html = f"""
            <div style="font-family:Arial,sans-serif;max-width:700px;">
                <h2 style="color:#4a7c2e;">Quotation - {q.quotation_number}</h2>
                <p>Dear {contact.name},</p>
                <p>Please find attached our quotation for your reference:</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <tr><td style="padding:6px;color:#666;width:140px;">Quotation No.</td><td style="padding:6px;font-weight:bold;">{q.quotation_number}</td></tr>
                    <tr><td style="padding:6px;color:#666;">Delivery Terms</td><td style="padding:6px;">{delivery_display}</td></tr>
                    <tr><td style="padding:6px;color:#666;">Payment Terms</td><td style="padding:6px;">{payment_display}</td></tr>
                    <tr><td style="padding:6px;color:#666;">Freight</td><td style="padding:6px;">{q.get_freight_terms_display() if q.freight_terms else 'To be discussed'}</td></tr>
                    <tr><td style="padding:6px;color:#666;">Validity</td><td style="padding:6px;">{q.validity_days} days</td></tr>
                </table>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <tr style="background:#4a7c2e;color:white;"><th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">Product</th><th style="padding:8px;text-align:left;">Details</th><th style="padding:8px;text-align:right;">Unit Price</th><th style="padding:8px;text-align:right;">Total</th></tr>
                    {items_html}
                    <tr style="font-weight:bold;background:#f5f5f5;"><td colspan="4" style="padding:8px;text-align:right;">Total:</td><td style="padding:8px;text-align:right;">{q.currency} {q.total:,.2f}</td></tr>
                </table>
                {f'<p>{q.notes}</p>' if q.notes else ''}
                <p>Please confirm your acceptance or let us know if you need any modifications.</p>
                <p>Best regards,<br/><b>Kriya Biosys Private Limited</b><br/><i>"Go Organic! Save Planet!"</i></p>
            </div>
            """

            # Generate PDF attachment
            from .quotation_service import generate_quotation_pdf
            from io import BytesIO
            pdf_buffer = generate_quotation_pdf(q)
            pdf_bytes = pdf_buffer.read()
            pdf_file = BytesIO(pdf_bytes)
            pdf_file.name = f'Quotation_{q.quotation_number.replace("/", "-")}.pdf'

            from communications.services import EmailService
            try:
                EmailService.send_email(
                    email_account=email_account,
                    to=contact_email,
                    subject=f'Quotation {q.quotation_number} - Kriya Biosys',
                    body_html=body_html,
                    attachments=[pdf_file],
                )
            except Exception as e:
                return Response({'error': f'Failed to send email: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Log communication
            from communications.models import Communication
            Communication.objects.create(
                client=q.client, contact=contact, user=request.user,
                comm_type='email', direction='outbound',
                subject=f'Quotation {q.quotation_number}', body=body_html,
                status='sent', email_account=email_account, external_email=contact_email,
            )

        q.sent_via = send_via
        q.sent_at = timezone.now()
        if q.status in ['approved', 'draft', 'pending_approval']:
            q.status = 'sent'
        q.save()

        return Response({'status': 'sent', 'sent_via': send_via})
