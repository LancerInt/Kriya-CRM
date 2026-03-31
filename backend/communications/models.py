from django.db import models
from common.models import TimeStampedModel
from common.encryption import encrypt_value, decrypt_value


class EmailAccount(TimeStampedModel):
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='email_accounts')
    email = models.EmailField()
    display_name = models.CharField(max_length=255, blank=True)
    imap_host = models.CharField(max_length=255)
    imap_port = models.IntegerField(default=993)
    smtp_host = models.CharField(max_length=255)
    smtp_port = models.IntegerField(default=587)
    username = models.CharField(max_length=255)
    password = models.TextField(default='')  # stored encrypted
    use_ssl = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    last_synced = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'email_accounts'

    def __str__(self):
        return f"{self.display_name or self.email}"

    def set_password(self, raw_password):
        self.password = encrypt_value(raw_password)

    def get_password(self):
        return decrypt_value(self.password)


class WhatsAppConfig(TimeStampedModel):
    phone_number_id = models.CharField(max_length=50, unique=True)
    business_account_id = models.CharField(max_length=50, blank=True)
    access_token = models.TextField(default='')  # stored encrypted
    verify_token = models.CharField(max_length=255)
    webhook_secret = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'whatsapp_configs'

    def __str__(self):
        return f"WhatsApp: {self.phone_number_id}"

    def set_access_token(self, raw_token):
        self.access_token = encrypt_value(raw_token)

    def get_access_token(self):
        return decrypt_value(self.access_token)


class Communication(TimeStampedModel):
    class Type(models.TextChoices):
        EMAIL = 'email', 'Email'
        WHATSAPP = 'whatsapp', 'WhatsApp'
        NOTE = 'note', 'Note'
        CALL = 'call', 'Call'

    class Direction(models.TextChoices):
        INBOUND = 'inbound', 'Inbound'
        OUTBOUND = 'outbound', 'Outbound'

    class Classification(models.TextChoices):
        CLIENT = 'client', 'Client'
        PROMOTION = 'promotion', 'Promotion'
        UPDATE = 'update', 'Update'
        SOCIAL = 'social', 'Social'
        SPAM = 'spam', 'Spam'
        UNKNOWN = 'unknown', 'Unknown'

    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='communications', null=True, blank=True)
    contact = models.ForeignKey('clients.Contact', on_delete=models.SET_NULL, null=True, blank=True)
    user = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='communications')
    comm_type = models.CharField(max_length=20, choices=Type.choices)
    direction = models.CharField(max_length=20, choices=Direction.choices, default=Direction.OUTBOUND)
    subject = models.CharField(max_length=500, blank=True)
    body = models.TextField(blank=True)
    status = models.CharField(max_length=30, default='sent')
    is_follow_up_required = models.BooleanField(default=False)
    ai_summary = models.TextField(blank=True, help_text='AI-generated summary')
    ai_extracted_intent = models.TextField(blank=True)
    ai_suggested_reply = models.TextField(blank=True)

    # Email classification fields
    is_client_mail = models.BooleanField(default=True, help_text='True if matched to a client')
    classification = models.CharField(
        max_length=20, choices=Classification.choices,
        default=Classification.CLIENT, db_index=True,
    )
    is_classified = models.BooleanField(default=False, help_text='True if classification has been run')
    is_read = models.BooleanField(default=False, db_index=True, help_text='True if this communication has been read')

    # Email integration fields
    email_message_id = models.CharField(max_length=500, blank=True, db_index=True)
    email_in_reply_to = models.CharField(max_length=500, blank=True)
    email_account = models.ForeignKey(
        EmailAccount, on_delete=models.SET_NULL, null=True, blank=True, related_name='communications'
    )

    # WhatsApp integration fields
    whatsapp_message_id = models.CharField(max_length=100, blank=True, db_index=True)

    # External contact fields
    external_phone = models.CharField(max_length=30, blank=True)
    external_email = models.EmailField(blank=True, default='')
    email_cc = models.TextField(blank=True, default='', help_text='Comma-separated CC emails')

    class Meta:
        db_table = 'communications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['client', 'comm_type']),
            models.Index(fields=['client', 'created_at']),
        ]

    def __str__(self):
        return f"{self.comm_type}: {self.subject or 'No subject'}"


class EmailDraft(TimeStampedModel):
    """AI-generated or manual email draft linked to an incoming communication."""
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SENT = 'sent', 'Sent'
        DISCARDED = 'discarded', 'Discarded'

    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='email_drafts', null=True, blank=True)
    communication = models.ForeignKey(Communication, on_delete=models.CASCADE, related_name='drafts',
                                       help_text='The incoming email this draft replies to')
    subject = models.CharField(max_length=500)
    body = models.TextField()
    to_email = models.EmailField()
    cc = models.TextField(blank=True, default='', help_text='Comma-separated CC emails')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    generated_by_ai = models.BooleanField(default=False)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='created_drafts')
    edited_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='edited_drafts')
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'email_drafts'
        ordering = ['-created_at']

    def __str__(self):
        return f"Draft: {self.subject[:50]} ({self.status})"


class CommunicationAttachment(TimeStampedModel):
    communication = models.ForeignKey(Communication, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='comm_attachments/%Y/%m/')
    filename = models.CharField(max_length=255)
    file_size = models.IntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = 'communication_attachments'


class QuoteRequest(TimeStampedModel):
    """
    Auto-generated quote request from incoming email/WhatsApp messages.
    Created when AI detects a quote intent in a communication.
    """
    class Status(models.TextChoices):
        NEW = 'new', 'New'
        REVIEWED = 'reviewed', 'Reviewed'
        CONVERTED = 'converted', 'Converted to Quote'
        REJECTED = 'rejected', 'Rejected'

    class SourceChannel(models.TextChoices):
        EMAIL = 'email', 'Email'
        WHATSAPP = 'whatsapp', 'WhatsApp'

    # Source
    source_communication = models.OneToOneField(
        Communication, on_delete=models.CASCADE, related_name='quote_request',
        help_text='The communication that triggered this quote request'
    )
    source_channel = models.CharField(max_length=20, choices=SourceChannel.choices)

    # Client/Contact (may be auto-matched or auto-created)
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='quote_requests', null=True, blank=True)
    contact = models.ForeignKey('clients.Contact', on_delete=models.SET_NULL, null=True, blank=True)
    sender_name = models.CharField(max_length=255, blank=True)
    sender_email = models.EmailField(blank=True)
    sender_phone = models.CharField(max_length=50, blank=True)
    client_auto_created = models.BooleanField(default=False, help_text='True if client was auto-created from this request')

    # Status & Assignment
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    assigned_to = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_quote_requests')

    # AI Extraction Fields
    ai_confidence = models.FloatField(default=0, help_text='0-1 confidence score for quote intent detection')
    extracted_product = models.CharField(max_length=500, blank=True)
    extracted_quantity = models.CharField(max_length=100, blank=True)
    extracted_unit = models.CharField(max_length=50, blank=True, default='MT')
    extracted_packaging = models.CharField(max_length=255, blank=True)
    extracted_destination_country = models.CharField(max_length=100, blank=True)
    extracted_destination_port = models.CharField(max_length=100, blank=True)
    extracted_delivery_terms = models.CharField(max_length=100, blank=True)
    extracted_payment_terms = models.CharField(max_length=255, blank=True)
    extracted_notes = models.TextField(blank=True)

    # Linked quotation (after conversion)
    linked_quotation = models.ForeignKey(
        'quotations.Quotation', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='quote_requests'
    )

    class Meta:
        db_table = 'quote_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f'QR: {self.extracted_product or "Unknown"} from {self.sender_name or self.sender_email or "Unknown"}'
