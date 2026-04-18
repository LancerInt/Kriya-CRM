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
        fields = ['id', 'product', 'product_name', 'client_product_name', 'description', 'quantity', 'unit', 'unit_price', 'total_price']
        read_only_fields = ['total_price']
        extra_kwargs = {
            'product_name': {'required': False, 'default': ''},
            'description': {'required': False, 'default': ''},
        }

class QuotationSerializer(serializers.ModelSerializer):
    items = QuotationItemSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    client_address = serializers.CharField(source='client.address', read_only=True, default='')
    client_city = serializers.CharField(source='client.city', read_only=True, default='')
    client_state = serializers.CharField(source='client.state', read_only=True, default='')
    client_postal_code = serializers.CharField(source='client.postal_code', read_only=True, default='')
    client_country = serializers.CharField(source='client.country', read_only=True, default='')
    client_phone = serializers.CharField(source='client.phone_number', read_only=True, default='')
    client_email = serializers.CharField(source='client.email', read_only=True, default='')
    client_primary_contact = serializers.SerializerMethodField()

    client_contact_phone = serializers.SerializerMethodField()

    def get_client_primary_contact(self, obj):
        """Return the executive name assigned to this client."""
        try:
            if obj.client.primary_executive:
                return obj.client.primary_executive.full_name or obj.client.primary_executive.username
            return ''
        except Exception:
            return ''

    def get_client_contact_phone(self, obj):
        """Return phone — client phone or primary contact phone."""
        try:
            if obj.client.phone_number:
                return obj.client.phone_number
            contact = obj.client.contacts.filter(is_primary=True, is_deleted=False).first()
            if contact and contact.phone:
                return contact.phone
            contact = obj.client.contacts.filter(is_deleted=False).first()
            return contact.phone if contact else ''
        except Exception:
            return ''
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default='')
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True, default='')
    parent_number = serializers.CharField(source='parent.quotation_number', read_only=True, default='')
    revision_count = serializers.SerializerMethodField()
    sent_by_name = serializers.SerializerMethodField()

    def get_revision_count(self, obj):
        return obj.revisions.count()

    def get_sent_by_name(self, obj):
        """Resolve who actually sent the email containing this quotation.

        Resolution order:
          1. EmailDraft(status='sent') tied to the quotation's source comm.
          2. Latest outbound Communication in the same thread.
          3. Latest outbound Communication for the same client after the
             quotation was created (covers send-to-client action).
          4. Final fallback: created_by if the quotation is in a sent state.
        """
        try:
            from communications.models import QuoteRequest, EmailDraft, Communication
            from django.db.models import Q
            qr = QuoteRequest.objects.filter(linked_quotation=obj).first()
            comm_id = qr.source_communication_id if qr else None
            if comm_id:
                draft = EmailDraft.objects.filter(
                    communication_id=comm_id, status='sent'
                ).select_related('created_by').order_by('-updated_at').first()
                if draft and draft.created_by:
                    return draft.created_by.full_name or draft.created_by.username or ''
                comm = Communication.objects.filter(id=comm_id).first()
                if comm:
                    thread_id = comm.thread_id or comm.id
                    out = Communication.objects.filter(
                        Q(thread_id=thread_id) | Q(id=thread_id),
                        direction='outbound', is_deleted=False,
                    ).select_related('user').order_by('-created_at').first()
                    if out and out.user:
                        return out.user.full_name or out.user.username or ''
            if obj.client_id:
                out = Communication.objects.filter(
                    client_id=obj.client_id,
                    direction='outbound',
                    is_deleted=False,
                    created_at__gte=obj.created_at,
                ).select_related('user').order_by('created_at').first()
                if out and out.user:
                    return out.user.full_name or out.user.username or ''
            if obj.status in ['sent', 'approved', 'accepted'] and obj.created_by:
                return obj.created_by.full_name or obj.created_by.username or ''
        except Exception:
            pass
        return ''

    class Meta:
        model = Quotation
        fields = ['id', 'quotation_number', 'client', 'client_name',
                  'client_address', 'client_city', 'client_state',
                  'client_postal_code', 'client_country', 'client_phone',
                  'client_email', 'client_primary_contact', 'client_contact_phone',
                  'inquiry', 'version',
                  'parent', 'status', 'currency', 'delivery_terms', 'payment_terms',
                  'payment_terms_detail', 'freight_terms',
                  'country_of_origin', 'country_of_final_destination',
                  'port_of_loading', 'port_of_discharge',
                  'vessel_flight_no', 'final_destination',
                  'packaging_details', 'display_overrides',
                  'validity_days', 'subtotal', 'total', 'notes', 'sent_via', 'sent_at',
                  'created_by', 'created_by_name',
                  'approved_by', 'approved_by_name', 'approved_at',
                  'parent_number', 'revision_count', 'sent_by_name',
                  'items', 'created_at', 'updated_at']
        read_only_fields = ['id', 'quotation_number', 'created_by', 'approved_by', 'approved_at']

class QuotationCreateSerializer(serializers.ModelSerializer):
    items = QuotationItemSerializer(many=True)
    valid_until = serializers.DateField(required=False, write_only=True)
    payment_terms = serializers.CharField(required=False, write_only=True)

    class Meta:
        model = Quotation
        fields = ['client', 'inquiry', 'currency', 'delivery_terms', 'payment_terms',
                  'payment_terms_detail', 'freight_terms', 'packaging_details',
                  'validity_days', 'notes', 'items', 'valid_until']
        extra_kwargs = {
            'client': {'required': False},
        }

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        valid_until = validated_data.pop('valid_until', None)
        payment_terms = validated_data.pop('payment_terms', '')
        user = self.context['request'].user

        # Auto-populate client from inquiry if not provided
        if not validated_data.get('client') and validated_data.get('inquiry'):
            validated_data['client'] = validated_data['inquiry'].client

        # Convert valid_until date to validity_days
        if valid_until:
            from django.utils import timezone
            delta = valid_until - timezone.now().date()
            validated_data['validity_days'] = max(delta.days, 1)

        # Store payment_terms in notes if provided
        if payment_terms:
            notes = validated_data.get('notes', '') or ''
            validated_data['notes'] = f"Payment Terms: {payment_terms}\n{notes}".strip()

        from .models import generate_quotation_number
        validated_data['quotation_number'] = generate_quotation_number()
        validated_data['created_by'] = user
        total = sum(i.get('quantity', 0) * i.get('unit_price', 0) for i in items_data)
        validated_data['subtotal'] = total
        validated_data['total'] = total
        quotation = Quotation.objects.create(**validated_data)
        for item_data in items_data:
            # Auto-populate product_name from product if not provided
            if not item_data.get('product_name') and item_data.get('product'):
                item_data['product_name'] = item_data['product'].name
            elif not item_data.get('product_name'):
                item_data['product_name'] = 'Custom Item'
            QuotationItem.objects.create(quotation=quotation, **item_data)
        return quotation
