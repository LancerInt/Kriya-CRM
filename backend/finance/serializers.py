from rest_framework import serializers
from .models import Invoice, InvoiceItem, Payment, FIRCRecord, GSTRecord

class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = ['id', 'description', 'quantity', 'unit_price', 'total_price']

class InvoiceSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    class Meta:
        model = Invoice
        fields = '__all__'
        read_only_fields = ['id']

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
