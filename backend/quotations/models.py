from django.db import models
from common.models import TimeStampedModel


class Quotation(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING_APPROVAL = 'pending_approval', 'Pending Approval'
        APPROVED = 'approved', 'Approved'
        SENT = 'sent', 'Sent'
        ACCEPTED = 'accepted', 'Accepted'
        REJECTED = 'rejected', 'Rejected'
        EXPIRED = 'expired', 'Expired'

    quotation_number = models.CharField(max_length=50, unique=True, db_index=True)
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='quotations')
    inquiry = models.ForeignKey('quotations.Inquiry', on_delete=models.SET_NULL, null=True, blank=True)
    version = models.IntegerField(default=1)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='revisions')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    currency = models.CharField(max_length=3, default='USD')
    delivery_terms = models.CharField(max_length=20, default='FOB')
    packaging_details = models.TextField(blank=True)
    validity_days = models.IntegerField(default=30)
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_quotations')
    approved_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='approved_quotations')
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'quotations'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.quotation_number} - {self.client.company_name}"


class QuotationItem(models.Model):
    id = models.AutoField(primary_key=True)
    quotation = models.ForeignKey(Quotation, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
    product_name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit = models.CharField(max_length=20, default='KG')
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'quotation_items'

    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)


class Inquiry(TimeStampedModel):
    class Stage(models.TextChoices):
        INQUIRY = 'inquiry', 'Inquiry'
        DISCUSSION = 'discussion', 'Discussion'
        SAMPLE = 'sample', 'Sample'
        QUOTATION = 'quotation', 'Quotation'
        NEGOTIATION = 'negotiation', 'Negotiation'
        ORDER_CONFIRMED = 'order_confirmed', 'Order Confirmed'
        LOST = 'lost', 'Lost'

    class Source(models.TextChoices):
        EMAIL = 'email', 'Email'
        WHATSAPP = 'whatsapp', 'WhatsApp'
        MANUAL = 'manual', 'Manual'
        WEBSITE = 'website', 'Website'

    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='inquiries')
    contact = models.ForeignKey('clients.Contact', on_delete=models.SET_NULL, null=True, blank=True)
    assigned_to = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='inquiries')
    source = models.CharField(max_length=20, choices=Source.choices, default=Source.MANUAL)
    stage = models.CharField(max_length=20, choices=Stage.choices, default=Stage.INQUIRY)
    product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
    product_name = models.CharField(max_length=255, blank=True)
    quantity = models.CharField(max_length=100, blank=True)
    requirements = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    expected_value = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default='USD')

    class Meta:
        db_table = 'inquiries'
        ordering = ['-updated_at']
        verbose_name_plural = 'inquiries'

    def __str__(self):
        return f"INQ: {self.client.company_name} - {self.product_name or 'N/A'}"
