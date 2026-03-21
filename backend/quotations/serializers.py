from rest_framework import serializers
from .models import Inquiry, Quotation, QuotationItem

class InquirySerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    executive_name = serializers.CharField(source='assigned_to.full_name', read_only=True, default='')
    class Meta:
        model = Inquiry
        fields = ['id', 'client', 'client_name', 'contact', 'assigned_to', 'executive_name',
                  'source', 'stage', 'product', 'product_name', 'quantity', 'requirements',
                  'notes', 'expected_value', 'currency', 'created_at', 'updated_at']
        read_only_fields = ['id']

class QuotationItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuotationItem
        fields = ['id', 'product', 'product_name', 'description', 'quantity', 'unit', 'unit_price', 'total_price']
        read_only_fields = ['total_price']

class QuotationSerializer(serializers.ModelSerializer):
    items = QuotationItemSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default='')
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True, default='')
    class Meta:
        model = Quotation
        fields = ['id', 'quotation_number', 'client', 'client_name', 'inquiry', 'version',
                  'parent', 'status', 'currency', 'delivery_terms', 'packaging_details',
                  'validity_days', 'subtotal', 'total', 'notes', 'created_by', 'created_by_name',
                  'approved_by', 'approved_by_name', 'approved_at', 'items', 'created_at', 'updated_at']
        read_only_fields = ['id', 'quotation_number', 'created_by', 'approved_by', 'approved_at']

class QuotationCreateSerializer(serializers.ModelSerializer):
    items = QuotationItemSerializer(many=True)
    class Meta:
        model = Quotation
        fields = ['client', 'inquiry', 'currency', 'delivery_terms', 'packaging_details',
                  'validity_days', 'notes', 'items']
    def create(self, validated_data):
        items_data = validated_data.pop('items')
        user = self.context['request'].user
        count = Quotation.objects.count() + 1
        validated_data['quotation_number'] = f'QT-{count:05d}'
        validated_data['created_by'] = user
        total = sum(i['quantity'] * i['unit_price'] for i in items_data)
        validated_data['subtotal'] = total
        validated_data['total'] = total
        quotation = Quotation.objects.create(**validated_data)
        for item_data in items_data:
            QuotationItem.objects.create(quotation=quotation, **item_data)
        return quotation
