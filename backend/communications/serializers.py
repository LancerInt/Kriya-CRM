from rest_framework import serializers
from .models import Communication, CommunicationAttachment, EmailAccount, WhatsAppConfig
from common.encryption import encrypt_value


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
                  'is_follow_up_required', 'ai_summary', 'attachments',
                  'email_message_id', 'email_in_reply_to', 'email_account',
                  'whatsapp_message_id', 'external_phone', 'external_email',
                  'created_at']
        read_only_fields = ['id', 'user', 'email_message_id', 'email_in_reply_to',
                            'whatsapp_message_id', 'external_phone', 'external_email']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class EmailAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailAccount
        fields = ['id', 'email', 'display_name', 'imap_host', 'imap_port',
                  'smtp_host', 'smtp_port', 'username', 'password', 'use_ssl',
                  'is_active', 'last_synced', 'created_at', 'updated_at']
        read_only_fields = ['id', 'last_synced', 'created_at', 'updated_at']
        extra_kwargs = {
            'password': {'write_only': True},
        }

    def create(self, validated_data):
        raw_password = validated_data.pop('password', '')
        instance = super().create(validated_data)
        if raw_password:
            instance.set_password(raw_password)
            instance.save(update_fields=['password'])
        return instance

    def update(self, instance, validated_data):
        raw_password = validated_data.pop('password', None)
        instance = super().update(instance, validated_data)
        if raw_password:
            instance.set_password(raw_password)
            instance.save(update_fields=['password'])
        return instance


class WhatsAppConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = WhatsAppConfig
        fields = ['id', 'phone_number_id', 'business_account_id', 'access_token',
                  'verify_token', 'webhook_secret', 'is_active',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']
        extra_kwargs = {
            'access_token': {'write_only': True},
        }

    def create(self, validated_data):
        raw_token = validated_data.pop('access_token', '')
        instance = super().create(validated_data)
        if raw_token:
            instance.set_access_token(raw_token)
            instance.save(update_fields=['access_token'])
        return instance

    def update(self, instance, validated_data):
        raw_token = validated_data.pop('access_token', None)
        instance = super().update(instance, validated_data)
        if raw_token:
            instance.set_access_token(raw_token)
            instance.save(update_fields=['access_token'])
        return instance


class SendEmailSerializer(serializers.Serializer):
    to = serializers.EmailField()
    cc = serializers.CharField(required=False, allow_blank=True, default='')
    bcc = serializers.CharField(required=False, allow_blank=True, default='')
    subject = serializers.CharField(max_length=500)
    body = serializers.CharField()
    client = serializers.UUIDField(required=False, allow_null=True, default=None)
    email_account = serializers.UUIDField()


class SendWhatsAppSerializer(serializers.Serializer):
    to = serializers.CharField(max_length=30)
    message = serializers.CharField()
    client = serializers.UUIDField(required=False, allow_null=True, default=None)
