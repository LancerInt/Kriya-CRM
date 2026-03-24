from django.db import models
from common.models import TimeStampedModel
from common.encryption import encrypt_value, decrypt_value


class CallLog(TimeStampedModel):
    class Status(models.TextChoices):
        SCHEDULED = 'scheduled', 'Scheduled'
        COMPLETED = 'completed', 'Completed'
        MISSED = 'missed', 'Missed'
        CANCELLED = 'cancelled', 'Cancelled'

    class Platform(models.TextChoices):
        GOOGLE_MEET = 'google_meet', 'Google Meet'
        ZOOM = 'zoom', 'Zoom'
        TEAMS = 'teams', 'Microsoft Teams'
        WHATSAPP = 'whatsapp', 'WhatsApp Video'
        PHONE = 'phone', 'Phone Call'
        IN_PERSON = 'in_person', 'In Person'
        OTHER = 'other', 'Other'

    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='call_logs')
    contact = models.ForeignKey('clients.Contact', on_delete=models.SET_NULL, null=True, blank=True)
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='call_logs')
    scheduled_at = models.DateTimeField()
    agenda = models.TextField(blank=True)
    call_notes = models.TextField(blank=True)
    duration_minutes = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)

    # Meeting platform fields
    platform = models.CharField(max_length=20, choices=Platform.choices, default=Platform.GOOGLE_MEET)
    meeting_link = models.URLField(blank=True, max_length=500)
    recording_url = models.URLField(blank=True, max_length=500)

    # Post-meeting fields
    summary = models.TextField(blank=True, help_text='Meeting summary / key decisions')
    transcription = models.TextField(blank=True, help_text='Meeting transcription')
    follow_up_actions = models.TextField(blank=True, help_text='Action items from the meeting')

    class Meta:
        db_table = 'call_logs'
        ordering = ['-scheduled_at']


class MeetingPlatformConfig(TimeStampedModel):
    """Stores API credentials for meeting platforms (Zoom, Google, Teams)."""
    class PlatformType(models.TextChoices):
        ZOOM = 'zoom', 'Zoom'
        GOOGLE = 'google', 'Google Meet'
        TEAMS = 'teams', 'Microsoft Teams'

    platform = models.CharField(max_length=20, choices=PlatformType.choices, unique=True)
    is_active = models.BooleanField(default=True)

    # Zoom Server-to-Server OAuth
    zoom_account_id = models.CharField(max_length=255, blank=True)
    zoom_client_id = models.CharField(max_length=255, blank=True)
    zoom_client_secret = models.TextField(blank=True)  # encrypted

    # Google Calendar / Meet (OAuth 2.0)
    google_client_id = models.CharField(max_length=255, blank=True)
    google_client_secret = models.TextField(blank=True)  # encrypted
    google_refresh_token = models.TextField(blank=True)  # encrypted
    google_calendar_id = models.CharField(max_length=255, blank=True, default='primary')
    google_user_email = models.EmailField(blank=True)  # connected Google account

    # Microsoft Teams (Azure AD)
    teams_tenant_id = models.CharField(max_length=255, blank=True)
    teams_client_id = models.CharField(max_length=255, blank=True)
    teams_client_secret = models.TextField(blank=True)  # encrypted

    class Meta:
        db_table = 'meeting_platform_configs'

    def __str__(self):
        return f"{self.get_platform_display()} Config"

    def set_secret(self, field, value):
        setattr(self, field, encrypt_value(value))

    def get_secret(self, field):
        return decrypt_value(getattr(self, field))
