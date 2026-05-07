from rest_framework import serializers
from .models import Inspection, InspectionMedia, COADocument, MSDSDocument

class InspectionMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionMedia
        fields = ['id', 'file', 'media_type', 'uploaded_at']

class InspectionSerializer(serializers.ModelSerializer):
    media = InspectionMediaSerializer(many=True, read_only=True)
    shipment_number = serializers.CharField(source='shipment.shipment_number', read_only=True, default='')
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    client_name = serializers.SerializerMethodField()
    media_count = serializers.SerializerMethodField()

    class Meta:
        model = Inspection
        fields = '__all__'
        read_only_fields = ['id']

    def get_client_name(self, obj):
        if obj.order_id and obj.order.client_id:
            return obj.order.client.company_name
        if obj.shipment_id and obj.shipment.client_id:
            return obj.shipment.client.company_name
        return ''

    def get_media_count(self, obj):
        return obj.media.count()

class COADocumentSerializer(serializers.ModelSerializer):
    shipment_number = serializers.CharField(source='shipment.shipment_number', read_only=True, default='')
    product_name = serializers.CharField(source='product.name', read_only=True, default='')
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = COADocument
        fields = '__all__'
        read_only_fields = ['id']

    def get_client_name(self, obj):
        if obj.order_id and obj.order.client_id:
            return obj.order.client.company_name
        if obj.shipment_id and obj.shipment.client_id:
            return obj.shipment.client.company_name
        return ''


class MSDSDocumentSerializer(serializers.ModelSerializer):
    shipment_number = serializers.CharField(source='shipment.shipment_number', read_only=True, default='')
    product_name = serializers.CharField(source='product.name', read_only=True, default='')
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = MSDSDocument
        fields = '__all__'
        read_only_fields = ['id']

    def get_client_name(self, obj):
        if obj.order_id and obj.order.client_id:
            return obj.order.client.company_name
        if obj.shipment_id and obj.shipment.client_id:
            return obj.shipment.client.company_name
        return ''
