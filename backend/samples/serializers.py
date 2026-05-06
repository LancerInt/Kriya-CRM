from rest_framework import serializers
from .models import Sample, SampleFeedback, SampleItem, SampleDocument


class SampleDocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True, default='')
    class Meta:
        model = SampleDocument
        fields = ['id', 'doc_type', 'name', 'file', 'uploaded_by', 'uploaded_by_name', 'created_at']
        read_only_fields = ['id', 'uploaded_by']


class SampleFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = SampleFeedback
        fields = ['id', 'rating', 'comments', 'issues', 'bulk_order_interest', 'created_at']


class SampleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SampleItem
        fields = ['id', 'product', 'product_name', 'client_product_name', 'quantity', 'notes']


class SampleSerializer(serializers.ModelSerializer):
    feedback = SampleFeedbackSerializer(read_only=True)
    documents = SampleDocumentSerializer(many=True, read_only=True)
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    items = SampleItemSerializer(many=True, required=False)

    class Meta:
        model = Sample
        fields = ['id', 'sample_number', 'client', 'client_name', 'product', 'product_name', 'client_product_name',
                  'quantity', 'replied_at', 'prepared_at', 'dispatch_date', 'dispatch_notified_at',
                  'delivered_at', 'courier_details', 'tracking_number', 'status',
                  'sample_type', 'sample_type_locked', 'payment_received_at', 'firc_received_at',
                  'notes', 'source_communication', 'created_by', 'feedback',
                  'items', 'documents', 'created_at', 'updated_at']
        read_only_fields = ['id', 'sample_number', 'created_by', 'sample_type_locked']

    # Status chains by sample type. Status must move forward by exactly one
    # step at a time — bypassing intermediate stages (e.g. replied →
    # dispatched without prepared / payment_received) is rejected.
    _PAID_STATUS_CHAIN = [
        'requested', 'replied', 'prepared', 'payment_received',
        'dispatched', 'delivered', 'feedback_pending', 'feedback_received',
    ]
    _FREE_STATUS_CHAIN = [
        'requested', 'prepared', 'dispatched', 'delivered',
        'feedback_pending', 'feedback_received',
    ]

    def validate_sample_type(self, value):
        # Once locked, reject any further change to sample_type.
        if self.instance and self.instance.sample_type_locked and value != self.instance.sample_type:
            raise serializers.ValidationError(
                'Sample type is locked and cannot be changed once selected.'
            )
        return value

    def validate(self, attrs):
        """Enforce step-by-step status transitions for both Paid and Free
        samples — even when the client PATCHes ``status`` directly."""
        new_status = attrs.get('status')
        if not self.instance or not new_status or new_status == self.instance.status:
            return attrs
        # Resolve the chain to use — prefer the explicitly-supplied
        # sample_type in the payload, otherwise fall back to the saved one.
        sample_type = attrs.get('sample_type', self.instance.sample_type)
        chain = self._PAID_STATUS_CHAIN if sample_type == 'paid' else self._FREE_STATUS_CHAIN
        try:
            cur_idx = chain.index(self.instance.status)
        except ValueError:
            cur_idx = -1
        try:
            tgt_idx = chain.index(new_status)
        except ValueError:
            raise serializers.ValidationError({
                'status': f'"{new_status}" is not a valid step for a {sample_type or "free"} sample.',
            })
        # Allow forward by exactly one step. Backward (revert) is handled by
        # a separate endpoint.
        if tgt_idx != cur_idx + 1:
            next_label = chain[cur_idx + 1] if 0 <= cur_idx + 1 < len(chain) else 'feedback'
            raise serializers.ValidationError({
                'status': (
                    f'Cannot jump to "{new_status}". Please advance step by step — '
                    f'the next allowed step from "{self.instance.status}" is "{next_label}".'
                ),
            })
        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop('items', None)
        validated_data['created_by'] = self.context['request'].user
        # If the creator explicitly set a sample_type, lock it on creation.
        if validated_data.get('sample_type'):
            validated_data['sample_type_locked'] = True
        # Auto-generate the next SMP-NNNNN. Use MAX of existing numbers
        # + 1 so we never collide even if an old sample was deleted.
        from django.db.models import Max
        existing_max = 0
        for n in Sample.objects.exclude(sample_number='').values_list('sample_number', flat=True):
            try:
                tail = int(str(n).split('-')[-1])
                if tail > existing_max:
                    existing_max = tail
            except (ValueError, IndexError):
                pass
        validated_data['sample_number'] = f'SMP-{existing_max + 1:05d}'
        sample = super().create(validated_data)
        if items_data:
            for item in items_data:
                SampleItem.objects.create(sample=sample, **item)
        # The legacy "+ New Sample" form posts the product on the Sample
        # itself (product / product_name / quantity) and does NOT send an
        # `items` array. Mirror those legacy fields into a SampleItem so
        # the Requested Products list on the detail page is populated.
        if not items_data and (sample.product_id or sample.product_name):
            SampleItem.objects.create(
                sample=sample,
                product=sample.product,
                product_name=sample.product_name or '',
                client_product_name=sample.client_product_name or '',
                quantity=sample.quantity or '',
            )
        return sample

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        # If sample_type is being set for the first time on an unlocked sample,
        # lock it now.
        new_type = validated_data.get('sample_type')
        if new_type and not instance.sample_type_locked:
            validated_data['sample_type_locked'] = True

        # When source_communication is set for the first time (manual sample
        # whose Reply Mail just opened a fresh thread), stamp replied_at and —
        # for paid samples sitting at requested — advance to replied so the
        # timeline reflects that the first email went out.
        new_source = validated_data.get('source_communication')
        if new_source and not instance.source_communication:
            from django.utils import timezone as _tz
            if not instance.replied_at:
                validated_data['replied_at'] = _tz.now()
            if instance.sample_type == 'paid' and instance.status == 'requested':
                validated_data['status'] = 'replied'

        # When status advances via PATCH, stamp the matching timestamp so the
        # timeline shows the right dates and downstream gates work.
        new_status = validated_data.get('status')
        if new_status and new_status != instance.status:
            from django.utils import timezone as _tz
            now = _tz.now()
            if new_status == 'replied' and not instance.replied_at:
                validated_data['replied_at'] = now
            elif new_status == 'prepared' and not instance.prepared_at:
                validated_data['prepared_at'] = now
            elif new_status == 'payment_received' and not instance.payment_received_at:
                validated_data['payment_received_at'] = now
            elif new_status == 'dispatched' and not instance.dispatch_date:
                validated_data['dispatch_date'] = now.date()
            elif new_status == 'delivered' and not instance.delivered_at:
                validated_data['delivered_at'] = now

        sample = super().update(instance, validated_data)
        if items_data is not None:
            sample.items.all().delete()
            for item in items_data:
                SampleItem.objects.create(sample=sample, **item)
        return sample
