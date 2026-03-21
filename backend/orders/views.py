from rest_framework import viewsets
from .models import Order
from .serializers import OrderSerializer

class OrderViewSet(viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    filterset_fields = ['client', 'status']
    search_fields = ['order_number']
    def get_queryset(self):
        return Order.objects.select_related('client', 'created_by').prefetch_related('items').all()
