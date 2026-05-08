from common.models import SoftDeleteViewMixin
from rest_framework import viewsets
from .models import Shipment
from .serializers import ShipmentSerializer
from notifications.helpers import notify


class ShipmentViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = ShipmentSerializer
    filterset_fields = ['client', 'order', 'status']
    search_fields = ['shipment_number', 'container_number', 'bl_number']
    def get_queryset(self):
        qs = (Shipment.objects
              .filter(is_deleted=False)
              .exclude(client__company_name__icontains='(Auto-created)')
              .select_related('client', 'order'))
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    def perform_create(self, serializer):
        shipment = serializer.save()
        notify(
            title=f'New shipment: {shipment.shipment_number}',
            message=f'{self.request.user.full_name} created shipment for {shipment.client.company_name}.',
            notification_type='system', link='/shipments',
            actor=self.request.user, client=shipment.client,
        )

    def perform_update(self, serializer):
        shipment = serializer.save()
        notify(
            title=f'Shipment updated: {shipment.shipment_number}',
            message=f'{self.request.user.full_name} updated shipment status to {shipment.status.replace("_", " ")}.',
            notification_type='system', link='/shipments',
            actor=self.request.user, client=shipment.client,
        )
