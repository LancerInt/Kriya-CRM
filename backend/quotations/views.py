from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from .models import Inquiry, Quotation, QuotationItem
from .serializers import InquirySerializer, QuotationSerializer, QuotationCreateSerializer
from orders.models import Order, OrderItem
from finance.models import Invoice

class InquiryViewSet(viewsets.ModelViewSet):
    serializer_class = InquirySerializer
    filterset_fields = ['client', 'stage', 'source', 'assigned_to']
    search_fields = ['product_name', 'requirements']
    def get_queryset(self):
        return Inquiry.objects.select_related('client', 'assigned_to', 'product').all()
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
        new_stage = request.data.get('stage')
        if new_stage:
            inquiry.stage = new_stage
            inquiry.save()
        return Response(InquirySerializer(inquiry).data)

class QuotationViewSet(viewsets.ModelViewSet):
    filterset_fields = ['client', 'status']
    search_fields = ['quotation_number']
    def get_queryset(self):
        return Quotation.objects.select_related('client', 'created_by', 'approved_by').prefetch_related('items').all()
    def get_serializer_class(self):
        if self.action in ['create']:
            return QuotationCreateSerializer
        return QuotationSerializer

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
            delivery_terms=q.delivery_terms, total=q.total, created_by=request.user
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
