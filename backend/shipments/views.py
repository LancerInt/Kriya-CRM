from common.models import SoftDeleteViewMixin
from rest_framework import viewsets
from .models import Shipment
from .serializers import ShipmentSerializer

class ShipmentViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = ShipmentSerializer
    filterset_fields = ['client', 'order', 'status']
    search_fields = ['shipment_number', 'container_number', 'bl_number']
    def get_queryset(self):
        qs = Shipment.objects.filter(is_deleted=False).select_related('client', 'order')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs
