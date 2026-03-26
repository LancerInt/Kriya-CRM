from rest_framework import serializers
from .models import Order, OrderItem, OrderStatusHistory, OrderDocument, WorkflowEventLog, EmailLog


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'description', 'quantity', 'unit', 'unit_price', 'total_price']


class OrderStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.CharField(source='changed_by.full_name', read_only=True, default='')

    class Meta:
        model = OrderStatusHistory
        fields = ['id', 'from_status', 'to_status', 'changed_by', 'changed_by_name', 'remarks', 'created_at']


class OrderDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True, default='')

    class Meta:
        model = OrderDocument
        fields = ['id', 'doc_type', 'name', 'file', 'uploaded_by', 'uploaded_by_name', 'created_at']
        read_only_fields = ['id', 'uploaded_by']


class WorkflowEventSerializer(serializers.ModelSerializer):
    triggered_by_name = serializers.CharField(source='triggered_by.full_name', read_only=True, default='')

    class Meta:
        model = WorkflowEventLog
        fields = ['id', 'event_type', 'description', 'metadata', 'triggered_by_name', 'created_at']


class EmailLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailLog
        fields = ['id', 'to_email', 'subject', 'status', 'error', 'triggered_by', 'created_at']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default='')
    allowed_transitions = serializers.SerializerMethodField()
    quotation_number = serializers.CharField(source='quotation.quotation_number', read_only=True, default='')

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'client', 'client_name', 'quotation', 'quotation_number',
            'order_type', 'status', 'currency', 'delivery_terms', 'payment_terms',
            'freight_terms', 'total', 'notes', 'created_by', 'created_by_name',
            'po_document', 'po_number', 'po_received_date',
            'confirmed_at', 'pi_sent_at', 'po_received_at', 'docs_approved_at',
            'factory_ready_at', 'container_booked_at', 'inspection_passed_at',
            'dispatched_at', 'delivered_at',
            'allowed_transitions', 'items', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'order_number', 'status']

    def get_allowed_transitions(self, obj):
        from orders.workflow_service import get_allowed_transitions, get_status_display
        return [{'status': s, 'label': get_status_display(s)} for s in get_allowed_transitions(obj)]
