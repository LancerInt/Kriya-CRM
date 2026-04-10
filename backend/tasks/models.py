from django.db import models
from common.models import TimeStampedModel


class Task(TimeStampedModel):
    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        URGENT = 'urgent', 'Urgent'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    title = models.CharField(max_length=500)
    description = models.TextField(blank=True)
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, null=True, blank=True, related_name='tasks')
    linked_type = models.CharField(max_length=50, blank=True, help_text='e.g. quotation, order, shipment')
    linked_id = models.UUIDField(null=True, blank=True)
    owner = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='owned_tasks')
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_tasks')
    due_date = models.DateTimeField(null=True, blank=True, db_index=True)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    is_auto_generated = models.BooleanField(default=False)
    completed_at = models.DateTimeField(null=True, blank=True)
    status_note = models.CharField(max_length=500, blank=True, help_text='Custom status update text')
    # Notification tracking — set when the assignee was last notified about
    # the task. The daily reminder task uses these to decide whether to fire
    # the next reminder (day-before, every-5-days cadence, etc.).
    assigned_at = models.DateTimeField(null=True, blank=True,
                                        help_text='When the task was first assigned to the current owner')
    last_reminder_sent_at = models.DateTimeField(null=True, blank=True,
                                                  help_text='When the most recent due-date reminder was sent')

    class Meta:
        db_table = 'tasks'
        ordering = ['status', 'due_date']
        indexes = [
            models.Index(fields=['owner', 'status']),
            models.Index(fields=['client', 'status']),
            models.Index(fields=['status', 'due_date']),
        ]

    def __str__(self):
        return self.title
