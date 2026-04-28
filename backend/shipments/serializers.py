from rest_framework import serializers
from .models import Shipment

class ShipmentSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    order_id = serializers.UUIDField(source='order.id', read_only=True)
    order_status = serializers.CharField(source='order.status', read_only=True, default='')
    order_firc_received_at = serializers.DateTimeField(source='order.firc_received_at', read_only=True, default=None)
    class Meta:
        model = Shipment
        fields = '__all__'
        read_only_fields = ['id', 'shipment_number']

    def create(self, validated_data):
        count = Shipment.objects.count() + 1
        validated_data['shipment_number'] = f'SHP-{count:05d}'
        return super().create(validated_data)
