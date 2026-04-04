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
    source_communication = models.ForeignKey('communications.Communication', on_delete=models.SET_NULL, null=True, blank=True, help_text='The communication that triggered this PI request')
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

    # ── Display overrides (freight, insurance, discount, custom labels from editor) ──
    display_overrides = models.JSONField(default=dict, blank=True)

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
    product_name = models.CharField(max_length=255, help_text='Company/internal product name')
    client_product_name = models.CharField(max_length=255, blank=True, default='', help_text='Product name as the client calls it')
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


class CommercialInvoice(TimeStampedModel):
    """
    Dedicated Commercial Invoice matching the Kriya Biosys CI template.
    Includes Notify Party, dual currency (USD+INR), IGST, Loading Details, Grand Total.
    """
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SENT = 'sent', 'Sent'

    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, null=True, blank=True, related_name='commercial_invoices')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='commercial_invoices')
    invoice_number = models.CharField(max_length=50, unique=True)
    invoice_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    # ── Exporter Section (overridable labels) ──
    exporter_ref = models.CharField(max_length=255, blank=True, help_text='Exporter Ref / IEC etc.')

    # ── Consignee Section ──
    client_company_name = models.CharField(max_length=255)
    client_tax_number = models.CharField(max_length=100, blank=True)
    client_address = models.TextField(blank=True)
    client_pincode = models.CharField(max_length=30, blank=True)
    client_city_state_country = models.CharField(max_length=255, blank=True)
    client_phone = models.CharField(max_length=50, blank=True)

    # ── Notify Party Section ──
    notify_company_name = models.CharField(max_length=255, blank=True)
    notify_address = models.TextField(blank=True)
    notify_phone = models.CharField(max_length=50, blank=True)

    # ── Buyer (if other than consignee) ──
    buyer_order_no = models.CharField(max_length=100, blank=True)
    buyer_order_date = models.DateField(null=True, blank=True)

    # ── Shipment / Loading Details ──
    country_of_origin = models.CharField(max_length=100, default='India')
    country_of_final_destination = models.CharField(max_length=100, blank=True)
    port_of_loading = models.CharField(max_length=100, blank=True)
    port_of_discharge = models.CharField(max_length=100, blank=True)
    vessel_flight_no = models.CharField(max_length=100, blank=True)
    final_destination = models.CharField(max_length=100, blank=True)
    pre_carriage_by = models.CharField(max_length=100, blank=True)
    place_of_receipt = models.CharField(max_length=100, blank=True)
    terms_of_delivery = models.CharField(max_length=100, blank=True, help_text='e.g. FOB - Chennai Port')
    payment_terms = models.CharField(max_length=255, blank=True, help_text='e.g. D/A 30 Days')

    # ── Totals (dual currency) ──
    currency = models.CharField(max_length=3, default='USD')
    total_fob_usd = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    freight = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    insurance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_invoice_usd = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # INR equivalents
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=0, help_text='USD to INR rate')
    total_fob_inr = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    freight_inr = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    insurance_inr = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_invoice_inr = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # ── IGST ──
    igst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0, help_text='IGST percentage e.g. 18')
    igst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    grand_total_inr = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    amount_in_words = models.CharField(max_length=500, blank=True)

    # ── Bank Details ──
    bank_details = models.TextField(default='Bank name: ICICI Bank Ltd\nBranch name: Salem Main Branch\nBeneficiary: Kriya Biosys Private Limited\nIFSC Code: ICIC0006119\nSwift Code: ICICINBB')

    # ── Display overrides (custom labels, bank details fields from editor) ──
    display_overrides = models.JSONField(default=dict, blank=True)

    # ── PDF ──
    pdf_file = models.FileField(upload_to='commercial_invoices/%Y/%m/', null=True, blank=True)

    # ── Meta ──
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'commercial_invoices'
        ordering = ['-created_at']

    def __str__(self):
        return f'CI {self.invoice_number} - {self.client_company_name}'


class CommercialInvoiceItem(models.Model):
    """Line items for Commercial Invoice — matching Packing Details / Description of Goods."""
    id = models.AutoField(primary_key=True)
    ci = models.ForeignKey(CommercialInvoice, on_delete=models.CASCADE, related_name='items')
    product_name = models.CharField(max_length=255, help_text='Company/internal product name')
    client_product_name = models.CharField(max_length=255, blank=True, default='', help_text='Product name as the client calls it')
    hsn_code = models.CharField(max_length=50, blank=True, help_text='HSN/SAC Code')
    packages_description = models.TextField(blank=True, help_text='No. & Kind of Packages')
    description_of_goods = models.TextField(blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=20, default='KG')
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'commercial_invoice_items'

    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)


class LogisticsInvoice(TimeStampedModel):
    """Logistics Invoice for shipping/freight charges."""
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SENT = 'sent', 'Sent'

    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, null=True, blank=True, related_name='logistics_invoices')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='logistics_invoices')
    invoice_number = models.CharField(max_length=50, unique=True)
    invoice_date = models.DateField()
    exporter_ref = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)

    # ── Consignee (Client) ──
    client_company_name = models.CharField(max_length=255)
    client_tax_number = models.CharField(max_length=100, blank=True)
    client_address = models.TextField(blank=True)
    client_pincode = models.CharField(max_length=30, blank=True)
    client_city_state_country = models.CharField(max_length=255, blank=True)
    client_phone = models.CharField(max_length=50, blank=True)

    # ── Notify Party ──
    notify_company_name = models.CharField(max_length=255, blank=True)
    notify_address = models.TextField(blank=True)
    notify_phone = models.CharField(max_length=50, blank=True)

    # ── Shipment Details ──
    country_of_origin = models.CharField(max_length=100, default='India')
    country_of_final_destination = models.CharField(max_length=100, blank=True)
    port_of_loading = models.CharField(max_length=100, blank=True)
    port_of_discharge = models.CharField(max_length=100, blank=True)
    vessel_flight_no = models.CharField(max_length=100, blank=True)
    final_destination = models.CharField(max_length=100, blank=True)
    terms_of_delivery = models.CharField(max_length=100, blank=True)
    payment_terms = models.CharField(max_length=255, blank=True)
    buyer_reference = models.CharField(max_length=100, blank=True)
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=0)

    # ── Totals ──
    currency = models.CharField(max_length=3, default='USD')
    total_fob_usd = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    freight = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    insurance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    subtotal_usd = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    subtotal_inr = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    igst_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    igst_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    grand_total_inr = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount_in_words = models.CharField(max_length=500, blank=True)
    shipping_forwarding = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # ── Bank Details ──
    bank_details = models.TextField(default='Bank name: DBS Bank Ltd\nBranch name: Salem - India\nBeneficiary: Kriya Biosys Private Limited\nIFSC Code: DBSS0IN0811\nSwift Code: DBSSINBB\nA/C No: K32250073646\nA/C Type: CA Account')

    display_overrides = models.JSONField(default=dict, blank=True)
    pdf_file = models.FileField(upload_to='logistics_invoices/%Y/%m/', null=True, blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'logistics_invoices'
        ordering = ['-created_at']

    def __str__(self):
        return f'LI {self.invoice_number} - {self.client_company_name}'


class LogisticsInvoiceItem(models.Model):
    id = models.AutoField(primary_key=True)
    li = models.ForeignKey(LogisticsInvoice, on_delete=models.CASCADE, related_name='items')
    product_name = models.CharField(max_length=255)
    packages_description = models.TextField(blank=True, help_text='No. & Kind of Packages')
    description_of_goods = models.TextField(blank=True, help_text='Total N CODE etc.')
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.CharField(max_length=20, default='Kg')
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    amount_usd = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount_inr = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'logistics_invoice_items'

    def save(self, *args, **kwargs):
        self.amount_usd = self.quantity * self.unit_price
        super().save(*args, **kwargs)
