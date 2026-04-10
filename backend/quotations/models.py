from datetime import date
from django.db import models
from common.models import TimeStampedModel


def generate_quotation_number():
    """
    Generate quotation number in format: YYYY/KBnnn
    YYYY = financial year (April 1 start).
    If current month >= April, FY = current year. If < April, FY = current year - 1.

    The sequence counter only advances based on SENT quotations — drafts
    that were never sent don't consume a number. This prevents gaps like
    KB001, KB005, KB010 when many drafts are created but few are mailed out.
    """
    today = date.today()
    fy_year = today.year if today.month >= 4 else today.year - 1

    # Count only SENT quotations in this financial year for the sequence
    fy_start = date(fy_year, 4, 1)
    fy_end = date(fy_year + 1, 3, 31)
    from quotations.models import Quotation
    sent_count = Quotation.objects.filter(
        created_at__date__gte=fy_start,
        created_at__date__lte=fy_end,
        status='sent',
    ).count()

    # Next number = sent count + 1, skip any that already exist (legacy data)
    seq = sent_count + 1
    candidate = f'{fy_year}/KB{seq:03d}'
    while Quotation.objects.filter(quotation_number=candidate).exists():
        seq += 1
        candidate = f'{fy_year}/KB{seq:03d}'
    return candidate


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

    # Trade terms
    DELIVERY_CHOICES = [
        ('EXW', 'EXW - Ex Works (Factory)'),
        ('FCA', 'FCA - Free Carrier'),
        ('FOB', 'FOB - Free on Board'),
        ('CFR', 'CFR - Cost & Freight'),
        ('CIF', 'CIF - Cost Insurance & Freight'),
        ('DAP', 'DAP - Delivered at Place'),
        ('DDP', 'DDP - Delivered Duty Paid'),
    ]
    PAYMENT_CHOICES = [
        ('advance', '100% Advance'),
        ('50_advance', '50% Advance + 50% Before Shipment'),
        ('30_70', '30% Advance + 70% Against BL'),
        ('lc', 'Letter of Credit (LC)'),
        ('da', 'D/A - Documents Against Acceptance'),
        ('dp', 'D/P - Documents Against Payment'),
        ('cad', 'CAD - Cash Against Documents'),
        ('tt', 'TT - Telegraphic Transfer'),
        ('credit_30', 'Net 30 Days Credit'),
        ('credit_60', 'Net 60 Days Credit'),
        ('custom', 'Custom Terms'),
    ]
    FREIGHT_CHOICES = [
        ('sea_fcl', 'Sea - FCL (Full Container Load)'),
        ('sea_lcl', 'Sea - LCL (Less Container Load)'),
        ('air', 'Air Freight'),
        ('courier', 'Courier'),
        ('ex_works', 'Ex Works (Buyer arranges)'),
    ]

    delivery_terms = models.CharField(max_length=20, choices=DELIVERY_CHOICES, default='FOB')
    payment_terms = models.CharField(max_length=30, choices=PAYMENT_CHOICES, default='advance', blank=True)
    payment_terms_detail = models.CharField(max_length=255, blank=True, help_text='Custom payment terms if applicable')
    freight_terms = models.CharField(max_length=20, choices=FREIGHT_CHOICES, default='sea_fcl', blank=True)

    # ── Shipment Details ──
    country_of_origin = models.CharField(max_length=100, default='India')
    country_of_final_destination = models.CharField(max_length=100, blank=True)
    port_of_loading = models.CharField(max_length=100, blank=True)
    port_of_discharge = models.CharField(max_length=100, blank=True)
    vessel_flight_no = models.CharField(max_length=100, blank=True)
    final_destination = models.CharField(max_length=100, blank=True)

    packaging_details = models.TextField(blank=True)
    display_overrides = models.JSONField(default=dict, blank=True, help_text='Custom labels, footer text, consignee lines etc. from the editor form')
    validity_days = models.IntegerField(default=30)
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    sent_via = models.CharField(max_length=20, blank=True, help_text='email or whatsapp')
    sent_at = models.DateTimeField(null=True, blank=True)
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
    product_name = models.CharField(max_length=255, help_text='Company/internal product name')
    client_product_name = models.CharField(max_length=255, blank=True, default='', help_text='Product name as the client calls it')
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
