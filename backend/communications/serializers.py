from rest_framework import serializers
from .models import Communication, CommunicationAttachment, EmailAccount, WhatsAppConfig, EmailDraft, DraftAttachment, QuoteRequest
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
    assigned_executive = serializers.CharField(source='client.primary_executive.full_name', read_only=True, default='')
    assigned_executive_id = serializers.CharField(source='client.primary_executive.id', read_only=True, default='')
    attachments = AttachmentSerializer(many=True, read_only=True)
    draft_id = serializers.SerializerMethodField()
    draft_status = serializers.SerializerMethodField()

    class Meta:
        model = Communication
        fields = ['id', 'client', 'client_name', 'contact', 'contact_name', 'user',
                  'user_name', 'comm_type', 'direction', 'subject', 'body', 'status',
                  'is_follow_up_required', 'ai_summary', 'assigned_executive', 'assigned_executive_id', 'attachments',
                  'email_message_id', 'email_in_reply_to', 'email_account',
                  'whatsapp_message_id', 'external_phone', 'external_email',
                  'email_cc', 'draft_id', 'draft_status',
                  'is_client_mail', 'classification', 'is_classified',
                  'is_read', 'created_at']

    def get_draft_id(self, obj):
        draft = obj.drafts.filter(is_deleted=False).order_by('-created_at').first()
        return str(draft.id) if draft else None

    def get_draft_status(self, obj):
        draft = obj.drafts.filter(is_deleted=False).order_by('-created_at').first()
        return draft.status if draft else None
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


class DraftAttachmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = DraftAttachment
        fields = ['id', 'filename', 'file', 'file_size', 'created_at']
        read_only_fields = ['id', 'created_at']


class EmailDraftSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    original_subject = serializers.CharField(source='communication.subject', read_only=True, default='')
    original_direction = serializers.CharField(source='communication.direction', read_only=True, default='')
    attachments = DraftAttachmentSerializer(many=True, read_only=True)

    class Meta:
        model = EmailDraft
        fields = ['id', 'client', 'client_name', 'communication', 'original_subject',
                  'original_direction', 'subject', 'body', 'to_email', 'cc', 'status',
                  'generated_by_ai', 'created_by', 'edited_by',
                  'sent_at', 'last_saved_at', 'draft_version',
                  'created_at', 'updated_at', 'attachments']
        read_only_fields = ['id', 'client', 'communication', 'generated_by_ai',
                            'created_by', 'sent_at', 'created_at', 'updated_at',
                            'last_saved_at', 'draft_version']


class SendWhatsAppSerializer(serializers.Serializer):
    to = serializers.CharField(max_length=30)
    message = serializers.CharField()
    client = serializers.UUIDField(required=False, allow_null=True, default=None)


class QuoteRequestSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    assigned_to_name = serializers.CharField(source='assigned_to.full_name', read_only=True, default='')
    source_subject = serializers.CharField(source='source_communication.subject', read_only=True, default='')
    source_body = serializers.CharField(source='source_communication.body', read_only=True, default='')
    linked_quotation_number = serializers.CharField(source='linked_quotation.quotation_number', read_only=True, default='')
    linked_quotation_status = serializers.CharField(source='linked_quotation.status', read_only=True, default='')

    class Meta:
        model = QuoteRequest
        fields = [
            'id', 'source_communication', 'source_channel',
            'client', 'client_name', 'contact',
            'sender_name', 'sender_email', 'sender_phone',
            'client_auto_created',
            'status', 'assigned_to', 'assigned_to_name',
            'ai_confidence',
            'extracted_product', 'extracted_quantity', 'extracted_unit',
            'extracted_packaging', 'extracted_destination_country',
            'extracted_destination_port', 'extracted_delivery_terms',
            'extracted_payment_terms', 'extracted_notes',
            'linked_quotation', 'linked_quotation_number', 'linked_quotation_status',
            'source_subject', 'source_body',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'source_communication', 'source_channel',
                            'client_auto_created', 'ai_confidence',
                            'linked_quotation', 'created_at', 'updated_at']
