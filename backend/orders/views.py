from common.models import SoftDeleteViewMixin
from rest_framework import viewsets
from rest_framework.decorators import action
from django.http import HttpResponse
from .models import Order
from .serializers import OrderSerializer


class OrderViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    filterset_fields = ['client', 'status']
    search_fields = ['order_number']

    def get_queryset(self):
        qs = Order.objects.filter(is_deleted=False).select_related('client', 'created_by').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    @action(detail=True, methods=['get'], url_path='download-pdf')
    def download_pdf(self, request, pk=None):
        order = self.get_object()
        from common.pdf_utils import generate_order_pdf
        pdf_buffer = generate_order_pdf(order)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{order.order_number}.pdf"'
        return response
