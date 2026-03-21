from django.db import models
from common.models import TimeStampedModel


class CallLog(TimeStampedModel):
    class Status(models.TextChoices):
        SCHEDULED = 'scheduled', 'Scheduled'
        COMPLETED = 'completed', 'Completed'
        MISSED = 'missed', 'Missed'
        CANCELLED = 'cancelled', 'Cancelled'

    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='call_logs')
    contact = models.ForeignKey('clients.Contact', on_delete=models.SET_NULL, null=True, blank=True)
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='call_logs')
    scheduled_at = models.DateTimeField()
    agenda = models.TextField(blank=True)
    call_notes = models.TextField(blank=True)
    duration_minutes = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)

    class Meta:
        db_table = 'call_logs'
        ordering = ['-scheduled_at']
