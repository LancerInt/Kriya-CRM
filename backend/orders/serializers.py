from rest_framework import serializers
from .models import Order, OrderItem

class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'description', 'quantity', 'unit', 'unit_price', 'total_price']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default='')
    class Meta:
        model = Order
        fields = ['id', 'order_number', 'client', 'client_name', 'quotation', 'status',
                  'currency', 'delivery_terms', 'total', 'notes', 'created_by',
                  'created_by_name', 'items', 'created_at', 'updated_at']
        read_only_fields = ['id', 'order_number']
