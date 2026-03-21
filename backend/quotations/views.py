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
        Task.objects.create(
            title=f'Follow up on inquiry from {inquiry.client.company_name}',
            client=inquiry.client, owner=inquiry.assigned_to or self.request.user,
            created_by=self.request.user, priority='high', is_auto_generated=True,
            linked_type='inquiry', linked_id=inquiry.id
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
        return Response(QuotationSerializer(q).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        q = self.get_object()
        q.status = 'rejected'
        q.save()
        return Response(QuotationSerializer(q).data)

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
        Invoice.objects.create(
            invoice_number=f'PI-{inv_count:05d}', order=order, client=q.client,
            invoice_type='proforma', currency=q.currency, subtotal=q.subtotal,
            total=q.total, created_by=request.user
        )
        return Response({'order_id': str(order.id), 'order_number': order.order_number}, status=status.HTTP_201_CREATED)
