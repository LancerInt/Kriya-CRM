from rest_framework import serializers
from .models import Client, Contact, ClientPort, ClientAssignment


class ContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = Contact
        fields = ['id', 'name', 'email', 'phone', 'whatsapp', 'designation', 'is_primary', 'created_at']
        read_only_fields = ['id']


class ClientPortSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClientPort
        fields = ['id', 'port_name']


class ClientListSerializer(serializers.ModelSerializer):
    executive_name = serializers.CharField(source='primary_executive.full_name', read_only=True, default='')
    contact_count = serializers.IntegerField(read_only=True, default=0)
    order_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Client
        fields = ['id', 'company_name', 'country', 'city', 'business_type',
                  'preferred_currency', 'delivery_terms', 'status', 'primary_executive',
                  'executive_name', 'contact_count', 'order_count', 'created_at', 'updated_at']


class ClientDetailSerializer(serializers.ModelSerializer):
    contacts = ContactSerializer(many=True, read_only=True)
    ports = ClientPortSerializer(many=True, read_only=True)
    executive_name = serializers.CharField(source='primary_executive.full_name', read_only=True, default='')

    class Meta:
        model = Client
        fields = '__all__'


class ClientCreateSerializer(serializers.ModelSerializer):
    contacts = ContactSerializer(many=True, required=False)
    ports = serializers.ListField(child=serializers.CharField(), required=False)

    class Meta:
        model = Client
        fields = ['company_name', 'country', 'address', 'city', 'state', 'postal_code',
                  'business_type', 'website', 'delivery_terms', 'preferred_currency',
                  'credit_days', 'credit_limit', 'payment_mode', 'status',
                  'primary_executive', 'notes', 'contacts', 'ports']

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
