from rest_framework import serializers
from .models import Client, Contact, ClientPort, ClientAssignment, ClientPriceList, PurchaseHistory


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = ['id', 'client', 'name', 'email', 'phone', 'whatsapp', 'designation', 'is_primary', 'created_at']
        read_only_fields = ['id']


class ClientPortSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientPort
        fields = ['id', 'port_name']


class ClientPriceListSerializer(serializers.ModelSerializer):
    product_base_price = serializers.DecimalField(source='product.base_price', max_digits=15, decimal_places=2, read_only=True, default=None)

    class Meta:
        model = ClientPriceList
        fields = ['id', 'client', 'product', 'product_name', 'client_product_name',
                  'unit_price', 'currency', 'unit', 'moq', 'valid_from', 'valid_until',
                  'notes', 'product_base_price', 'created_at']
        read_only_fields = ['id']


class PurchaseHistorySerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')

    class Meta:
        model = PurchaseHistory
        fields = ['id', 'client', 'order', 'order_number', 'product', 'product_name',
                  'quantity', 'unit', 'unit_price', 'total_price', 'currency',
                  'purchase_date', 'invoice_number', 'status', 'notes', 'created_at']
        read_only_fields = ['id']


class ClientListSerializer(serializers.ModelSerializer):
    primary_executive_name = serializers.CharField(source='primary_executive.full_name', read_only=True, default='')
    shadow_executive_name = serializers.CharField(source='shadow_executive.full_name', read_only=True, default='')
    contact_count = serializers.IntegerField(read_only=True, default=0)
    order_count = serializers.IntegerField(read_only=True, default=0)
    client_role = serializers.CharField(read_only=True, default='')

    class Meta:
        model = Client
        fields = ['id', 'company_name', 'country', 'city', 'business_type',
                  'preferred_currency', 'delivery_terms', 'status', 'primary_executive',
                  'primary_executive_name', 'shadow_executive', 'shadow_executive_name',
                  'tier', 'client_role', 'contact_count', 'order_count', 'created_at', 'updated_at']


class ClientDetailSerializer(serializers.ModelSerializer):
    contacts = ContactSerializer(many=True, read_only=True)
    ports = ClientPortSerializer(many=True, read_only=True)
    executive_name = serializers.CharField(source='primary_executive.full_name', read_only=True, default='')
    primary_executive_name = serializers.CharField(source='primary_executive.full_name', read_only=True, default='')
    shadow_executive_name = serializers.CharField(source='shadow_executive.full_name', read_only=True, default='')
    shadow_executive_email = serializers.CharField(source='shadow_executive.email', read_only=True, default='')

    class Meta:
        model = Client
        fields = '__all__'


class ClientCreateSerializer(serializers.ModelSerializer):
    contacts = ContactSerializer(many=True, required=False, write_only=True)
    ports = serializers.ListField(child=serializers.CharField(), required=False, write_only=True)

    class Meta:
        model = Client
        fields = ['id', 'company_name', 'tax_number', 'country', 'address', 'city', 'state', 'postal_code',
                  'business_type', 'website', 'delivery_terms', 'preferred_currency',
                  'credit_days', 'credit_limit', 'payment_mode', 'status', 'tier',
                  'primary_executive', 'shadow_executive', 'notes', 'contacts', 'ports',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        contacts_data = validated_data.pop('contacts', [])
        ports_data = validated_data.pop('ports', [])

        client = Client.objects.create(**validated_data)

        for contact_data in contacts_data:
            Contact.objects.create(client=client, **contact_data)
        for port_name in ports_data:
            if port_name.strip():
                ClientPort.objects.create(client=client, port_name=port_name.strip())
        return client

    def update(self, instance, validated_data):
        validated_data.pop('contacts', None)
        validated_data.pop('ports', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        return instance
