from django.db import models
from common.models import TimeStampedModel


class ChatRoom(TimeStampedModel):
    """Chat rooms — general, topic-specific, or private direct messages."""
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_general = models.BooleanField(default=False)
    is_direct = models.BooleanField(default=False)
    members = models.ManyToManyField('accounts.User', blank=True, related_name='direct_rooms')

    class Meta:
        db_table = 'chat_rooms'
        ordering = ['-is_general', 'name']

    def __str__(self):
        return self.name


class ChatMessage(TimeStampedModel):
    """Individual messages in a chat room."""
    class MsgType(models.TextChoices):
        TEXT = 'text', 'Text'
        IMAGE = 'image', 'Image'
        VIDEO = 'video', 'Video'
        AUDIO = 'audio', 'Audio'
        FILE = 'file', 'File'

    room = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages')
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='chat_messages')
    message_type = models.CharField(max_length=10, choices=MsgType.choices, default=MsgType.TEXT)
    content = models.TextField(blank=True)
    file = models.FileField(upload_to='chat/%Y/%m/', blank=True, null=True)
    filename = models.CharField(max_length=255, blank=True)
    is_edited = models.BooleanField(default=False)

    class Meta:
        db_table = 'chat_messages'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.user.full_name}: {self.content[:50]}"
