from rest_framework import viewsets
from .models import Shipment
from .serializers import ShipmentSerializer

class ShipmentViewSet(viewsets.ModelViewSet):
    serializer_class = ShipmentSerializer
    filterset_fields = ['client', 'order', 'status']
    search_fields = ['shipment_number', 'container_number', 'bl_number']
    def get_queryset(self):
        return Shipment.objects.select_related('client', 'order').all()
