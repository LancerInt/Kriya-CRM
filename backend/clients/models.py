from django.db import models
from common.models import SoftDeleteModel


class Client(SoftDeleteModel):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        INACTIVE = 'inactive', 'Inactive'
        PROSPECT = 'prospect', 'Prospect'

    company_name = models.CharField(max_length=255, db_index=True)
    country = models.CharField(max_length=100, blank=True, db_index=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    business_type = models.CharField(max_length=100, blank=True)
    website = models.URLField(blank=True)
    delivery_terms = models.CharField(max_length=20, default='FOB')
    preferred_currency = models.CharField(max_length=3, default='USD')
    credit_days = models.IntegerField(default=30)
    credit_limit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    payment_mode = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    primary_executive = models.ForeignKey(
        'accounts.User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='primary_clients'
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'clients'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['company_name', 'country']),
            models.Index(fields=['status', 'is_deleted']),
        ]

    def __str__(self):
        return self.company_name


class Contact(SoftDeleteModel):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='contacts')
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    whatsapp = models.CharField(max_length=30, blank=True)
    designation = models.CharField(max_length=100, blank=True)
    is_primary = models.BooleanField(default=False)

    class Meta:
        db_table = 'contacts'
        ordering = ['-is_primary', 'name']

    def __str__(self):
        return f"{self.name} ({self.client.company_name})"


class ClientPort(models.Model):
    id = models.AutoField(primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='ports')
    port_name = models.CharField(max_length=255)

    class Meta:
        db_table = 'client_ports'

    def __str__(self):
        return self.port_name


class ClientAssignment(models.Model):
    id = models.AutoField(primary_key=True)
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='assignments')
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='client_assignments')
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'client_assignments'
        unique_together = ('client', 'user')
