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


class CommunicationAttachment(TimeStampedModel):
    communication = models.ForeignKey(Communication, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='comm_attachments/%Y/%m/')
    filename = models.CharField(max_length=255)
    file_size = models.IntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = 'communication_attachments'
