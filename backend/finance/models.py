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

    # Either of these (or none) anchors the record. Auto-created when a
    # user ticks FIRC on a Sample or an Order; the legacy `payment` FK
    # stays for older flows that recorded FIRC directly against a Payment.
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, null=True, blank=True, related_name='firc_records')
    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, null=True, blank=True, related_name='firc_records')
    sample = models.ForeignKey('samples.Sample', on_delete=models.CASCADE, null=True, blank=True, related_name='firc_records')
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


def generate_pi_number():
    """
    Generate PI number in format: YY-MM/KB-NNN
    YY = 2-digit year, MM = current month.
    NNN = sequential counter of SENT PIs in the current financial year
    (April to March). Resets every April.

    Only sent PIs consume a number — drafts that were never sent don't
    affect the sequence. The final number is assigned at send-time.

    Handles legacy data: if the generated number already exists (from PIs
    created before this numbering scheme), keeps incrementing until a
    unique number is found.
    """
    from datetime import date
    today = date.today()
    fy_year = today.year if today.month >= 4 else today.year - 1
    fy_start = date(fy_year, 4, 1)
    fy_end = date(fy_year + 1, 3, 31)

    sent_count = ProformaInvoice.objects.filter(
        created_at__date__gte=fy_start,
        created_at__date__lte=fy_end,
        status='sent',
    ).count()

    prefix = today.strftime("%y-%m")
    seq = sent_count + 1
    candidate = f'{prefix}/KB-{seq:03d}'
    while ProformaInvoice.objects.filter(invoice_number=candidate).exists():
        seq += 1
        candidate = f'{prefix}/KB-{seq:03d}'
    return candidate


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

    # ── Version tracking (mirrors Quotation) ──
    # When a client asks for changes on a previously-sent PI we create a new
    # row with version+1 and parent → previous PI, instead of overwriting it.
    version = models.IntegerField(default=1)
    parent = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='revisions')

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
    product_name = models.TextField(help_text='Company/internal product name')
    client_product_name = models.TextField(blank=True, default='', help_text='Product name as the client calls it')
    packages_description = models.TextField(blank=True, help_text='No. & Kind of Packages')
    description_of_goods = models.TextField(blank=True, help_text='Description + NCM Code + LOTE')
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    unit = models.TextField(default='Ltrs', blank=True)
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
    client_email = models.CharField(max_length=255, blank=True)

    # ── Notify Party Section ──
    notify_company_name = models.CharField(max_length=255, blank=True)
    notify_address = models.TextField(blank=True)
    notify_phone = models.CharField(max_length=50, blank=True)
    notify_city_state_country = models.CharField(max_length=255, blank=True)
    notify_pincode = models.CharField(max_length=30, blank=True)
    notify_tax_number = models.CharField(max_length=100, blank=True)
    notify_email = models.CharField(max_length=255, blank=True)
    notify_mobile = models.CharField(max_length=50, blank=True)

    # ── Buyer (if other than consignee) ──
    buyer_order_no = models.CharField(max_length=100, blank=True)
    buyer_order_date = models.DateField(null=True, blank=True)
    buyer_company_name = models.CharField(max_length=255, blank=True)
    buyer_address = models.TextField(blank=True)
    buyer_pincode = models.CharField(max_length=30, blank=True)
    buyer_city_state_country = models.CharField(max_length=255, blank=True)
    buyer_phone = models.CharField(max_length=50, blank=True)
    buyer_reference = models.CharField(max_length=255, blank=True, help_text='e.g. REF: S26-10052 / PO 00135')

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
    # Renamed from payment_terms — same field, label aligned with PI's
    # `terms_of_trade`. Drives the order's Payment Tracking card whenever
    # the CI is updated. payment_terms kept as a soft-deprecated mirror
    # so older API clients/PDF templates still resolve a value.
    terms_of_trade = models.CharField(max_length=255, blank=True, help_text='e.g. D/A 30 Days')
    payment_terms = models.CharField(max_length=255, blank=True, help_text='[deprecated] mirror of terms_of_trade')

    # ── Totals (dual currency) ──
    currency = models.CharField(max_length=3, default='USD')
    total_fob_usd = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    freight = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    insurance = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_invoice_usd = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    # INR equivalents
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4, default=0, help_text='USD to INR rate')
    batch_no = models.CharField(max_length=100, blank=True, help_text='Batch/Lot number for the shipment')
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


class ComplianceDocument(TimeStampedModel):
    """Covers the four export-compliance docs generated at Docs Preparing:
    DBK Declaration, Examination Report, Export Declaration Form, Factory Stuffing Annexure.
    Each doc keeps its editable placeholders inside the `fields` JSON dict.
    Legal body text is baked into the PDF renderer — only placeholders vary.
    """
    class DocType(models.TextChoices):
        DBK_DECLARATION = 'dbk_declaration', 'DBK Declaration'
        EXAMINATION_REPORT = 'examination_report', 'Examination Report'
        EXPORT_DECLARATION = 'export_declaration', 'Export Declaration Form'
        FACTORY_STUFFING = 'factory_stuffing', 'Factory Stuffing Annexure'
        NON_DG_DECLARATION = 'non_dg_declaration', 'Non-DG Declaration Letter'

    doc_type = models.CharField(max_length=40, choices=DocType.choices)
    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, related_name='compliance_docs')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='compliance_docs')
    fields = models.JSONField(default=dict, blank=True)
    pdf_file = models.FileField(upload_to='compliance/%Y/%m/', blank=True, null=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_compliance_docs')

    class Meta:
        db_table = 'compliance_documents'
        ordering = ['-created_at']
        unique_together = [('order', 'doc_type')]

    def __str__(self):
        return f'{self.get_doc_type_display()} — {self.order.order_number}'


class PackingList(TimeStampedModel):
    """Client or Logistic Packing List — shares most fields; diverges via list_type."""
    class ListType(models.TextChoices):
        CLIENT = 'client', 'Client Packing List'
        LOGISTIC = 'logistic', 'Logistic Packing List'

    list_type = models.CharField(max_length=20, choices=ListType.choices)
    invoice_number = models.CharField(max_length=50, db_index=True)
    date = models.DateField(null=True, blank=True)
    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, related_name='packing_lists')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='packing_lists')

    # Exporter is the static Kriya block; stored so it can be tweaked per doc if needed.
    exporter_details = models.JSONField(default=dict, blank=True)
    # Consignee (client) block — full address. For logistic it's only a one-line ("To the Order - Brazil").
    consignee_details = models.JSONField(default=dict, blank=True)
    consignee_to = models.CharField(max_length=255, blank=True, default='')
    # Notify (logistic only)
    notify_details = models.JSONField(default=dict, blank=True)

    shipment_details = models.JSONField(default=dict, blank=True)
    # items: [{product_name, no_kind_packages, description_goods, quantity}]
    items = models.JSONField(default=list, blank=True)
    container_details = models.CharField(max_length=255, blank=True, default='')
    weight_summary = models.JSONField(default=dict, blank=True)
    # loading_details (logistic only): list of lines ["TN 04 BE 0087 - DFSU 7112053 - 01 to 20 IBCs", ...]
    loading_details = models.JSONField(default=list, blank=True)
    declaration = models.TextField(blank=True, default='')
    grand_total = models.CharField(max_length=100, blank=True, default='')

    pdf_file = models.FileField(upload_to='packing_lists/%Y/%m/', blank=True, null=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_packing_lists')

    class Meta:
        db_table = 'packing_lists'
        ordering = ['-created_at']
        unique_together = [('order', 'list_type')]

    def __str__(self):
        return f'{self.invoice_number} ({self.get_list_type_display()})'


class PackingInstructionForm(TimeStampedModel):
    """Packing Instructions Form (PIF) — one per order line (per product line)."""
    pif_number = models.CharField(max_length=50, unique=True, db_index=True)
    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, related_name='pifs')
    order_item = models.ForeignKey('orders.OrderItem', on_delete=models.CASCADE, related_name='pifs')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='pifs')

    po_no = models.CharField(max_length=100, blank=True, default='')
    pif_date = models.DateField(null=True, blank=True)

    # Product details (left block)
    product_name = models.CharField(max_length=255, blank=True, default='')
    product_description = models.CharField(max_length=500, blank=True, default='')
    packing_description = models.CharField(max_length=500, blank=True, default='')
    quantity = models.CharField(max_length=100, blank=True, default='')

    # Notes block (right of product details)
    notes = models.TextField(blank=True, default='')

    # Container details — two sub-blocks (JSON)
    # { 'type': '', 'bottle_colour': '', 'cap_colour': '', 'cap_type': '', 'measuring_cups': '' }
    container_left = models.JSONField(default=dict, blank=True)
    # { 'colour': '', 'box_thickness': '', 'carton_box_label': '', 'batch_sticker': '', 'batch_no': '' }
    container_right = models.JSONField(default=dict, blank=True)

    # Dynamic repeating packing sections
    # [ { 'label': '100 ml', 'quantity_left': {...}, 'accessories_right': {...} }, ... ]
    packing_sections = models.JSONField(default=list, blank=True)

    # Footer paragraph (editable)
    footer_note = models.TextField(blank=True, default='')

    pdf_file = models.FileField(upload_to='pif/%Y/%m/', blank=True, null=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_pifs')

    class Meta:
        db_table = 'packing_instruction_forms'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.pif_number} - {self.product_name}'
