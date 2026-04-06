from rest_framework import serializers
from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.full_name', read_only=True, default='')
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    creator_name = serializers.CharField(source='created_by.full_name', read_only=True, default='')
    is_overdue = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = ['id', 'title', 'description', 'client', 'client_name', 'linked_type',
                  'linked_id', 'owner', 'owner_name', 'created_by', 'creator_name',
                  'due_date', 'priority', 'status', 'status_note', 'is_auto_generated', 'is_overdue',
                  'completed_at', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_by']
        extra_kwargs = {'owner': {'required': False}}

    def get_is_overdue(self, obj):
        if obj.due_date and obj.status in ['pending', 'in_progress']:
            from django.utils import timezone
            return obj.due_date < timezone.now()
        return False

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        if 'owner' not in validated_data:
            validated_data['owner'] = self.context['request'].user
        return super().create(validated_data)
