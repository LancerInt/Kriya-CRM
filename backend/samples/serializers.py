from rest_framework import serializers
from .models import Sample, SampleFeedback

class SampleFeedbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = SampleFeedback
        fields = ['id', 'rating', 'comments', 'issues', 'bulk_order_interest', 'created_at']

class SampleSerializer(serializers.ModelSerializer):
    feedback = SampleFeedbackSerializer(read_only=True)
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    class Meta:
        model = Sample
        fields = ['id', 'client', 'client_name', 'product', 'product_name', 'client_product_name',
                  'quantity', 'replied_at', 'prepared_at', 'dispatch_date', 'delivered_at',
                  'courier_details', 'tracking_number', 'status',
                  'notes', 'source_communication', 'created_by', 'feedback', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_by']
    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)
