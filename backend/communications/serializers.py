from rest_framework import serializers
from .models import Communication, CommunicationAttachment


class AttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunicationAttachment
        fields = ['id', 'file', 'filename', 'file_size', 'mime_type', 'created_at']
        read_only_fields = ['id']


class CommunicationSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True, default='')
    contact_name = serializers.CharField(source='contact.name', read_only=True, default='')
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    attachments = AttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = Communication
        fields = ['id', 'client', 'client_name', 'contact', 'contact_name', 'user',
                  'user_name', 'comm_type', 'direction', 'subject', 'body', 'status',
                  'is_follow_up_required', 'ai_summary', 'attachments', 'created_at']
        read_only_fields = ['id', 'user']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)
