from rest_framework import serializers
from django.db.models import Q
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

    def to_representation(self, instance):
        # Convert legacy markdown-style bodies (with **bold** and plain newlines)
        # into Quill-compatible HTML on read, so existing drafts render correctly.
        # Also strip any legacy "Best regards, / Kriya Biosys ..." sign-off the
        # old AI generator baked into the body — the per-user signature is now
        # appended at send-time, so the editor should show the body without it.
        data = super().to_representation(instance)
        from .ai_email_service import _markdown_to_html
        from .signature import strip_signature
        body = data.get('body') or ''
        body = strip_signature(body)
        data['body'] = _markdown_to_html(body)
        return data

    class Meta:
        model = EmailDraft
        fields = ['id', 'client', 'client_name', 'communication', 'original_subject',
                  'original_direction', 'subject', 'body', 'to_email', 'cc', 'status',
                  'generated_by_ai', 'created_by', 'edited_by',
                  'sent_at', 'last_saved_at', 'draft_version',
                  'created_at', 'updated_at', 'attachments']
        # `client` and `communication` must be writable on create so the
        # frontend can build a draft for any thread (replies, follow-ups,
        # standalone composes). They were marked read-only by mistake which
        # caused the IntegrityError on POST /communications/drafts/.
        read_only_fields = ['id', 'generated_by_ai',
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
    linked_quotation_version = serializers.SerializerMethodField()

    def get_linked_quotation_version(self, obj):
        """Highest version in the linked quotation's revision chain — so the
        Revise button label tracks the latest V, not the originally-linked V1.
        """
        if not obj.linked_quotation_id:
            return 1
        try:
            from quotations.models import Quotation
            root = obj.linked_quotation
            while root.parent_id:
                root = root.parent
            all_ids = {root.id}
            stack = [root]
            while stack:
                node = stack.pop()
                for child in Quotation.objects.filter(parent=node, is_deleted=False).only('id'):
                    if child.id not in all_ids:
                        all_ids.add(child.id)
                        stack.append(child)
            max_v = Quotation.objects.filter(id__in=all_ids).order_by('-version').values_list('version', flat=True).first()
            return max_v or 1
        except Exception:
            return obj.linked_quotation.version or 1
    # Full version chain (root + every revision) for the linked quotation, plus
    # any Proforma Invoices spawned from the same source email. Renders as
    # V1/V2/V3 chips on the inquiry card so the full negotiation history is
    # visible at a glance.
    linked_quotation_versions = serializers.SerializerMethodField()
    linked_pi_versions = serializers.SerializerMethodField()

    def _walk_chain(self, root):
        """Walk parent → children, returning the full version chain."""
        from quotations.models import Quotation
        all_ids = {root.id}
        stack = [root]
        while stack:
            node = stack.pop()
            for child in Quotation.objects.filter(parent=node, is_deleted=False).only('id'):
                if child.id not in all_ids:
                    all_ids.add(child.id)
                    stack.append(child)
        return Quotation.objects.filter(id__in=all_ids).order_by('version', 'created_at')

    def _resolve_sent_by(self, comm_id):
        """Find who actually sent the reply mail for a given source_communication.

        Strategy (in order of preference):
          1. The most recently sent EmailDraft tied to this inbound message —
             EmailDraft.created_by is the executive who clicked "Send Reply".
          2. The most recent OUTBOUND Communication in the same thread, using
             Communication.user (the user who owns the email_account it was
             sent from).
        Returns the user's full_name (or username), or '' if nothing matched.
        """
        if not comm_id:
            return ''
        try:
            from communications.models import Communication, EmailDraft
            # 1) Prefer the EmailDraft that was actually sent on this inbound msg
            draft = EmailDraft.objects.filter(
                communication_id=comm_id, status='sent'
            ).select_related('created_by').order_by('-updated_at').first()
            if draft and draft.created_by:
                return draft.created_by.full_name or draft.created_by.username or ''
            # 2) Fallback: latest outbound message in the same thread
            comm = Communication.objects.filter(id=comm_id).first()
            if comm:
                thread_id = comm.thread_id or comm.id
                out = Communication.objects.filter(
                    Q(thread_id=thread_id) | Q(id=thread_id),
                    direction='outbound', is_deleted=False,
                ).select_related('user').order_by('-created_at').first()
                if out and out.user:
                    return out.user.full_name or out.user.username or ''
        except Exception:
            pass
        return ''

    def get_linked_quotation_versions(self, obj):
        if not obj.linked_quotation_id:
            return []
        try:
            from quotations.models import Quotation
            root = obj.linked_quotation
            while root.parent_id:
                root = root.parent
            chain = self._walk_chain(root)
            # Always resolve the sender from the outbound email — the
            # quotation's own status flag doesn't always flip to 'sent' when
            # the user just emailed the PDF as a reply attachment, so we
            # attribute based on whoever actually sent the reply mail.
            sent_by = self._resolve_sent_by(obj.source_communication_id)
            return [
                {
                    'id': str(q.id),
                    'quotation_number': q.quotation_number,
                    'version': q.version or 1,
                    'status': q.status,
                    'created_by_name': (q.created_by.full_name if q.created_by else '') or '',
                    'approved_by_name': (q.approved_by.full_name if q.approved_by else '') or '',
                    'sent_by_name': sent_by,
                    'sent_at': q.sent_at.isoformat() if q.sent_at else '',
                    'created_at': q.created_at.isoformat() if q.created_at else '',
                }
                for q in chain
            ]
        except Exception:
            return []

    def get_linked_pi_versions(self, obj):
        try:
            from finance.models import ProformaInvoice
            qs = ProformaInvoice.objects.filter(
                source_communication_id=obj.source_communication_id,
                is_deleted=False,
            ).select_related('created_by').order_by('version', 'created_at')
            # Also pull any descendants (revisions) of those PIs so the chain
            # is complete even when create_standalone auto-versioned them.
            seen = {pi.id: pi for pi in qs}
            stack = list(qs)
            while stack:
                node = stack.pop()
                for child in ProformaInvoice.objects.filter(parent=node, is_deleted=False).select_related('created_by'):
                    if child.id not in seen:
                        seen[child.id] = child
                        stack.append(child)
            chain = sorted(seen.values(), key=lambda p: (p.version or 1, p.created_at))
            sent_by = self._resolve_sent_by(obj.source_communication_id)
            return [
                {
                    'id': str(p.id),
                    'invoice_number': p.invoice_number,
                    'version': p.version or 1,
                    'status': p.status,
                    'created_by_name': (p.created_by.full_name if p.created_by else '') or '',
                    'sent_by_name': sent_by,
                    'created_at': p.created_at.isoformat() if p.created_at else '',
                }
                for p in chain
            ]
        except Exception:
            return []

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
            'linked_quotation', 'linked_quotation_number', 'linked_quotation_status', 'linked_quotation_version',
            'linked_quotation_versions', 'linked_pi_versions',
            'source_subject', 'source_body',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'source_communication', 'source_channel',
                            'client_auto_created', 'ai_confidence',
                            'linked_quotation', 'created_at', 'updated_at']
