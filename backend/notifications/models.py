from django.db import models
from common.models import TimeStampedModel


class Notification(TimeStampedModel):
    class Type(models.TextChoices):
        TASK = 'task', 'Task'
        APPROVAL = 'approval', 'Approval'
        ALERT = 'alert', 'Alert'
        REMINDER = 'reminder', 'Reminder'
        SYSTEM = 'system', 'System'

    user = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='notifications')
    notification_type = models.CharField(max_length=20, choices=Type.choices)
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    is_read = models.BooleanField(default=False)
    link = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']


class ActivityLog(TimeStampedModel):
    user = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=50)
    entity_type = models.CharField(max_length=50)
    entity_id = models.UUIDField(null=True, blank=True)
    description = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'activity_logs'
        ordering = ['-created_at']
