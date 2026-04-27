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
        fields = ['id', 'client', 'client_name', 'product', 'product_name', 'client_product_name',
                  'quantity', 'replied_at', 'prepared_at', 'dispatch_date', 'dispatch_notified_at',
                  'delivered_at', 'courier_details', 'tracking_number', 'status',
                  'notes', 'source_communication', 'created_by', 'feedback',
                  'items', 'documents', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_by']

    def create(self, validated_data):
        items_data = validated_data.pop('items', None)
        validated_data['created_by'] = self.context['request'].user
        sample = super().create(validated_data)
        if items_data:
            for item in items_data:
                SampleItem.objects.create(sample=sample, **item)
        return sample

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        sample = super().update(instance, validated_data)
        if items_data is not None:
            # Replace all items in one shot — same pattern as Quotation
            sample.items.all().delete()
            for item in items_data:
                SampleItem.objects.create(sample=sample, **item)
        return sample
