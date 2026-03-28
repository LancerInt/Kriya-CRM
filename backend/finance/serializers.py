from rest_framework import serializers
from .models import (Invoice, InvoiceItem, Payment, FIRCRecord, GSTRecord,
                      ProformaInvoice, ProformaInvoiceItem,
                      CommercialInvoice, CommercialInvoiceItem)

class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = ['id', 'product_name', 'description', 'quantity', 'unit', 'unit_price', 'total_price']

class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    quotation_number = serializers.CharField(source='quotation.quotation_number', read_only=True, default='')
    class Meta:
        model = Invoice
        fields = '__all__'
        read_only_fields = ['id']

class InvoiceCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invoice
        fields = ['client', 'order', 'invoice_type', 'currency', 'subtotal', 'tax', 'due_date', 'notes']

    def create(self, validated_data):
        count = Invoice.objects.count() + 1
        inv_type = validated_data.get('invoice_type', 'commercial')
        prefix = 'PI' if inv_type == 'proforma' else 'INV'
        validated_data['invoice_number'] = f'{prefix}-{count:05d}'
        validated_data['total'] = validated_data.get('subtotal', 0) + validated_data.get('tax', 0)
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)

class PaymentSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ['id']

class FIRCRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = FIRCRecord
        fields = '__all__'

class GSTRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = GSTRecord
        fields = '__all__'


class PIItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProformaInvoiceItem
        fields = ['id', 'product_name', 'packages_description', 'description_of_goods',
                  'quantity', 'unit', 'unit_price', 'total_price']


class ProformaInvoiceSerializer(serializers.ModelSerializer):
    items = PIItemSerializer(many=True, read_only=True)
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')

    class Meta:
        model = ProformaInvoice
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'pdf_file']


class CIItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialInvoiceItem
        fields = ['id', 'product_name', 'hsn_code', 'packages_description',
                  'description_of_goods', 'quantity', 'unit', 'unit_price', 'total_price']


class CommercialInvoiceSerializer(serializers.ModelSerializer):
    items = CIItemSerializer(many=True, read_only=True)
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')

    class Meta:
        model = CommercialInvoice
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'pdf_file']
