from rest_framework import serializers
from .models import (Invoice, InvoiceItem, Payment, FIRCRecord, GSTRecord,
                      ProformaInvoice, ProformaInvoiceItem,
                      CommercialInvoice, CommercialInvoiceItem,
                      LogisticsInvoice, LogisticsInvoiceItem,
                      PackingInstructionForm, PackingList, ComplianceDocument)

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
    order_id = serializers.SerializerMethodField()
    order_number = serializers.SerializerMethodField()
    payment_breakdown = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = '__all__'
        read_only_fields = ['id']

    # Payments auto-created from a CommercialInvoice carry a reference of
    # the form "CI <invoice_number>". Resolve that back to the source CI
    # to surface the linked Order in the Payments list.
    def _resolved_ci(self, obj):
        if getattr(self, '_ci_cache_obj', None) is obj and hasattr(self, '_ci_cache_value'):
            return self._ci_cache_value
        ci = None
        ref = (obj.reference or '').strip()
        if ref.upper().startswith('CI '):
            from .models import CommercialInvoice
            ci = CommercialInvoice.objects.filter(invoice_number=ref[3:].strip()).select_related('order').first()
        self._ci_cache_obj = obj
        self._ci_cache_value = ci
        return ci

    def get_order_id(self, obj):
        ci = self._resolved_ci(obj)
        return str(ci.order_id) if ci and ci.order_id else None

    def get_order_number(self, obj):
        ci = self._resolved_ci(obj)
        return ci.order.order_number if ci and ci.order_id else ''

    def get_payment_breakdown(self, obj):
        """Split the Payment amount into Advance / Balance based on the
        linked Order's payment terms (e.g. "50% advance D/A 30 days").
        Returns null when the linked order has no advance terms — the
        Payments row then just shows the plain total."""
        ci = self._resolved_ci(obj)
        if not ci or not ci.order_id:
            return None
        from orders.payment_terms import parse_payment_terms
        order = ci.order
        parsed = parse_payment_terms(order.payment_terms)
        if not parsed['has_advance'] and not parsed['has_balance']:
            return None
        try:
            total = float(obj.amount or 0)
        except (TypeError, ValueError):
            total = 0
        if not total:
            return None
        advance_amt = round(total * parsed['advance_pct'] / 100, 2) if parsed['has_advance'] else 0
        balance_amt = round(total - advance_amt, 2) if parsed['has_balance'] else 0
        return {
            'advance_pct': parsed['advance_pct'],
            'balance_pct': parsed['balance_pct'],
            'advance_amount': advance_amt,
            'balance_amount': balance_amt,
            'advance_received': bool(order.advance_payment_received_at),
            'balance_received': bool(order.balance_payment_received_at),
        }

class FIRCRecordSerializer(serializers.ModelSerializer):
    source_kind = serializers.SerializerMethodField()
    source_label = serializers.SerializerMethodField()
    source_id = serializers.SerializerMethodField()
    client_name = serializers.SerializerMethodField()
    amount = serializers.SerializerMethodField()
    currency = serializers.SerializerMethodField()

    class Meta:
        model = FIRCRecord
        fields = '__all__'

    def get_source_kind(self, obj):
        if obj.order_id:
            return 'order'
        if obj.sample_id:
            return 'sample'
        if obj.payment_id:
            return 'payment'
        return ''

    def get_source_label(self, obj):
        if obj.order_id:
            return obj.order.order_number
        if obj.sample_id:
            return obj.sample.sample_number or ''
        if obj.payment_id and obj.payment.reference:
            return obj.payment.reference
        return ''

    def get_source_id(self, obj):
        return str(obj.order_id or obj.sample_id or obj.payment_id or '')

    def get_client_name(self, obj):
        if obj.order_id and obj.order.client_id:
            return obj.order.client.company_name
        if obj.sample_id and obj.sample.client_id:
            return obj.sample.client.company_name
        if obj.payment_id and obj.payment.client_id:
            return obj.payment.client.company_name
        return ''

    def get_amount(self, obj):
        if obj.order_id and obj.order.total is not None:
            return float(obj.order.total)
        if obj.payment_id:
            return float(obj.payment.amount or 0)
        return None

    def get_currency(self, obj):
        if obj.order_id:
            return obj.order.currency or 'USD'
        if obj.payment_id:
            return obj.payment.currency or 'USD'
        return 'USD'

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


class ComplianceDocumentSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    doc_type_display = serializers.CharField(source='get_doc_type_display', read_only=True)
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = ComplianceDocument
        fields = '__all__'
        read_only_fields = ['id', 'created_by', 'pdf_file']

    def get_pdf_url(self, obj):
        return obj.pdf_file.url if obj.pdf_file else None


class PackingListSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = PackingList
        fields = '__all__'
        read_only_fields = ['id', 'invoice_number', 'created_by', 'pdf_file']

    def get_pdf_url(self, obj):
        return obj.pdf_file.url if obj.pdf_file else None


class PackingInstructionFormSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='order.order_number', read_only=True, default='')
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default='')
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = PackingInstructionForm
        fields = '__all__'
        read_only_fields = ['id', 'pif_number', 'created_by', 'pdf_file']

    def get_pdf_url(self, obj):
        return obj.pdf_file.url if obj.pdf_file else None
