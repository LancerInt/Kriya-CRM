from django.db import models
from common.models import TimeStampedModel


class Communication(TimeStampedModel):
    class Type(models.TextChoices):
        EMAIL = 'email', 'Email'
        WHATSAPP = 'whatsapp', 'WhatsApp'
        NOTE = 'note', 'Note'
        CALL = 'call', 'Call'

    class Direction(models.TextChoices):
        INBOUND = 'inbound', 'Inbound'
        OUTBOUND = 'outbound', 'Outbound'

    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='communications')
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
