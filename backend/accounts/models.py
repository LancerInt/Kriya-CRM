import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        MANAGER = 'manager', 'Manager'
        EXECUTIVE = 'executive', 'Executive'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.EXECUTIVE)
    phone = models.CharField(max_length=20, blank=True)
    whatsapp = models.CharField(max_length=20, blank=True)
    department = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=50, blank=True, default='')
    # Email signature fields — appended to outgoing mails
    signature_name = models.CharField(
        max_length=120, blank=True, default='',
        help_text='Display name in the email signature, e.g. "Shobana C"',
    )
    signature_phone = models.CharField(max_length=50, blank=True, default='')
    signature_email = models.EmailField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'
        ordering = ['first_name', 'last_name']

    def __str__(self):
        return f"{self.get_full_name()} ({self.role})"

    @property
    def full_name(self):
        return self.get_full_name() or self.username


class ExecutiveShadow(models.Model):
    """
    Executive-level shadow assignment.
    When executive A is shadow of executive B, A can see ALL of B's clients'
    emails, WhatsApp messages, and communications.
    """
    id = models.AutoField(primary_key=True)
    executive = models.ForeignKey(User, on_delete=models.CASCADE, related_name='shadowing',
                                  help_text='The executive who is being shadowed (primary)')
    shadow = models.ForeignKey(User, on_delete=models.CASCADE, related_name='shadow_of',
                               help_text='The shadow executive who gets access')
    assigned_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='+')

    class Meta:
        db_table = 'executive_shadows'
        unique_together = ('executive', 'shadow')
        ordering = ['-assigned_at']

    def __str__(self):
        return f'{self.shadow.full_name} shadows {self.executive.full_name}'
