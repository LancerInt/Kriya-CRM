from rest_framework import serializers
from .models import (Invoice, InvoiceItem, Payment, FIRCRecord, GSTRecord,
                      ProformaInvoice, ProformaInvoiceItem,
                      CommercialInvoice, CommercialInvoiceItem,
                      LogisticsInvoice, LogisticsInvoiceItem)

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
        fields = ['id', 'product_name', 'client_product_name', 'packages_description',
                  'description_of_goods', 'quantity', 'unit', 'unit_price', 'total_price']


class ProformaInvoiceSerializer(serializers.ModelSerializer):
    items = PIItemSerializer(many=True, read_only=True)
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    parent_number = serializers.CharField(source='parent.invoice_number', read_only=True, default='')
    revision_count = serializers.SerializerMethodField()
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default='')
    sent_by_name = serializers.SerializerMethodField()
    latest_version = serializers.SerializerMethodField()

    def get_revision_count(self, obj):
        return obj.revisions.filter(is_deleted=False).count()

    def get_latest_version(self, obj):
        """Highest version in this PI's revision chain — used to label the
        Revise button so V2 → V3 → V4 keeps incrementing correctly even when
        the user clicks Revise on an older row in the same chain.
        """
        try:
            from .models import ProformaInvoice
            root = obj
            while root.parent_id:
                root = root.parent
            all_ids = {root.id}
            stack = [root]
            while stack:
                node = stack.pop()
                for child in ProformaInvoice.objects.filter(parent=node, is_deleted=False).only('id', 'parent_id'):
                    if child.id not in all_ids:
                        all_ids.add(child.id)
                        stack.append(child)
            max_v = (
                ProformaInvoice.objects.filter(id__in=all_ids, is_deleted=False)
                .order_by('-version').values_list('version', flat=True).first()
            )
            return max_v or (obj.version or 1)
        except Exception:
            return obj.version or 1

    def get_sent_by_name(self, obj):
        """Resolve who actually sent the reply mail containing this PI.

        Resolution order:
          1. EmailDraft(status='sent') tied to the PI's source_communication —
             this is the user who clicked Send Reply on the AI Draft modal.
          2. Latest outbound Communication in the same thread.
          3. Latest outbound Communication for the same client (covers PIs
             that were sent via the standalone PI send-email action, which
             doesn't create an EmailDraft row).
          4. Final fallback: created_by — if the PI is marked 'sent' we know
             a human acted on it, so attributing to the creator is better
             than showing an empty Sent line.
        """
        try:
            from communications.models import EmailDraft, Communication
            from django.db.models import Q
            comm_id = obj.source_communication_id
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
            # 3) Latest outbound from this client (covers standalone PI sends)
            if obj.client_id:
                out = Communication.objects.filter(
                    client_id=obj.client_id,
                    direction='outbound',
                    is_deleted=False,
                    created_at__gte=obj.created_at,
                ).select_related('user').order_by('created_at').first()
                if out and out.user:
                    return out.user.full_name or out.user.username or ''
            # 4) Status-based fallback — if marked sent but nothing else matched
            if obj.status == 'sent' and obj.created_by:
                return obj.created_by.full_name or obj.created_by.username or ''
        except Exception:
            pass
        return ''

    class Meta:
        model = ProformaInvoice
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'pdf_file']


class CIItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommercialInvoiceItem
        fields = ['id', 'product_name', 'client_product_name', 'hsn_code',
                  'packages_description', 'description_of_goods',
                  'quantity', 'unit', 'unit_price', 'total_price']


class CommercialInvoiceSerializer(serializers.ModelSerializer):
    items = CIItemSerializer(many=True, read_only=True)
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')

    class Meta:
        model = CommercialInvoice
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'pdf_file']


class LIItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LogisticsInvoiceItem
        fields = ['id', 'product_name', 'packages_description', 'description_of_goods',
                  'quantity', 'unit', 'unit_price', 'amount_usd', 'amount_inr']


class LogisticsInvoiceSerializer(serializers.ModelSerializer):
    items = LIItemSerializer(many=True, read_only=True)
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')

    class Meta:
        model = LogisticsInvoice
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'pdf_file']
