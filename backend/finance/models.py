from django.db import models
from common.models import TimeStampedModel


class Invoice(TimeStampedModel):
    class Type(models.TextChoices):
        PROFORMA = 'proforma', 'Proforma Invoice'
        COMMERCIAL = 'commercial', 'Commercial Invoice'

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SENT = 'sent', 'Sent'
        PAID = 'paid', 'Paid'
        PARTIAL = 'partial', 'Partially Paid'
        OVERDUE = 'overdue', 'Overdue'
        CANCELLED = 'cancelled', 'Cancelled'

    invoice_number = models.CharField(max_length=50, unique=True, db_index=True)
    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, null=True, blank=True, related_name='invoices')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='invoices')
    invoice_type = models.CharField(max_length=20, choices=Type.choices, default=Type.COMMERCIAL)
    currency = models.CharField(max_length=3, default='USD')
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    due_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'invoices'
        ordering = ['-created_at']


class InvoiceItem(models.Model):
    id = models.AutoField(primary_key=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='items')
    description = models.CharField(max_length=500)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'invoice_items'


class Payment(TimeStampedModel):
    class Mode(models.TextChoices):
        TT = 'TT', 'Telegraphic Transfer'
        LC = 'LC', 'Letter of Credit'
        ADVANCE = 'advance', 'Advance'
        CREDIT = 'credit', 'Credit'

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, null=True, blank=True, related_name='payments')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.CharField(max_length=3, default='USD')
    payment_date = models.DateField()
    mode = models.CharField(max_length=20, choices=Mode.choices)
    reference = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'payments'
        ordering = ['-payment_date']


class FIRCRecord(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RECEIVED = 'received', 'Received'

    payment = models.OneToOneField(Payment, on_delete=models.CASCADE, related_name='firc')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    document = models.FileField(upload_to='firc/%Y/%m/', null=True, blank=True)
    received_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'firc_records'


class GSTRecord(TimeStampedModel):
    class Status(models.TextChoices):
        FILED = 'filed', 'Filed'
        PROCESSING = 'processing', 'Processing'
        RECEIVED = 'received', 'Received'

    shipment = models.ForeignKey('shipments.Shipment', on_delete=models.CASCADE, related_name='gst_records')
    eligible_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    claimed_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.FILED)
    document = models.FileField(upload_to='gst/%Y/%m/', null=True, blank=True)

    class Meta:
        db_table = 'gst_records'
