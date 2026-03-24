from rest_framework import viewsets
from rest_framework.decorators import action
from django.http import HttpResponse
from .models import Order
from .serializers import OrderSerializer


class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    filterset_fields = ['client', 'status']
    search_fields = ['order_number']

    def get_queryset(self):
        return Order.objects.select_related('client', 'created_by').prefetch_related('items').all()

    @action(detail=True, methods=['get'], url_path='download-pdf')
    def download_pdf(self, request, pk=None):
        order = self.get_object()
        from common.pdf_utils import generate_order_pdf
        pdf_buffer = generate_order_pdf(order)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{order.order_number}.pdf"'
        return response
