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
    quotation = models.ForeignKey('quotations.Quotation', on_delete=models.SET_NULL, null=True, blank=True, related_name='invoices')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='invoices')
    invoice_type = models.CharField(max_length=20, choices=Type.choices, default=Type.COMMERCIAL)
    currency = models.CharField(max_length=3, default='USD')
    delivery_terms = models.CharField(max_length=20, blank=True, default='')
    payment_terms = models.CharField(max_length=255, blank=True, default='')
    validity = models.CharField(max_length=100, blank=True, default='')
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    due_date = models.DateField(null=True, blank=True)
    bank_details = models.TextField(blank=True, default='')
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'invoices'
        ordering = ['-created_at']


class InvoiceItem(models.Model):
    id = models.AutoField(primary_key=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='items')
    product_name = models.CharField(max_length=255, blank=True, default='')
    description = models.CharField(max_length=500, blank=True, default='')
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit = models.CharField(max_length=20, default='KG')
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


class ProformaInvoice(TimeStampedModel):
    """
    Dedicated Proforma Invoice matching the Kriya Biosys PI template.
    Stores all fields needed for the exact PI PDF format.
    """
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SENT = 'sent', 'Sent'

    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, null=True, blank=True, related_name='proforma_invoices')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='proforma_invoices')
    invoice_number = models.CharField(max_length=50, unique=True)
    invoice_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    # ── Consignee (Client) Section ──
    client_company_name = models.CharField(max_length=255)
    client_tax_number = models.CharField(max_length=100, blank=True)
    client_address = models.TextField(blank=True)
    client_pincode = models.CharField(max_length=30, blank=True)
    client_city_state_country = models.CharField(max_length=255, blank=True)
    client_phone = models.CharField(max_length=50, blank=True)

    # ── Shipment Details Section ──
    country_of_origin = models.CharField(max_length=100, default='India')
    country_of_final_destination = models.CharField(max_length=100, blank=True)
    port_of_loading = models.CharField(max_length=100, blank=True)
    port_of_discharge = models.CharField(max_length=100, blank=True)
    vessel_flight_no = models.CharField(max_length=100, blank=True)
    final_destination = models.CharField(max_length=100, blank=True)
    terms_of_trade = models.CharField(max_length=100, blank=True, help_text='e.g. D/A 30 Days')
    terms_of_delivery = models.CharField(max_length=100, blank=True, help_text='e.g. FOB - Chennai Port')
    buyer_reference = models.CharField(max_length=100, blank=True, help_text='e.g. PO No: TBI-000')

    # ── Totals ──
    currency = models.CharField(max_length=3, default='USD')
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount_in_words = models.CharField(max_length=500, blank=True)

    # ── Bank Details ──
    bank_details = models.TextField(default='Bank name: ICICI Bank Ltd\nBranch name: Salem Main Branch\nBeneficiary: Kriya Biosys Private Limited\nIFSC Code: ICIC0006119\nSwift Code: ICICINBB')

    # ── PDF ──
    pdf_file = models.FileField(upload_to='proforma_invoices/%Y/%m/', null=True, blank=True)

    # ── Meta ──
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'proforma_invoices'
        ordering = ['-created_at']

    def __str__(self):
        return f'PI {self.invoice_number} - {self.client_company_name}'


class ProformaInvoiceItem(models.Model):
    """Line items for Proforma Invoice — matching Packing Details section."""
    id = models.AutoField(primary_key=True)
    pi = models.ForeignKey(ProformaInvoice, on_delete=models.CASCADE, related_name='items')
    product_name = models.CharField(max_length=255)
    packages_description = models.TextField(blank=True, help_text='No. & Kind of Packages')
    description_of_goods = models.TextField(blank=True, help_text='Description + NCM Code + LOTE')
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=20, default='Ltrs')
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'proforma_invoice_items'

    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)
