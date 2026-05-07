from django.db import models
from common.models import TimeStampedModel


class Order(TimeStampedModel):
    """Core order model with state-machine driven status."""

    class Status(models.TextChoices):
        CONFIRMED = 'confirmed', 'Confirmed'
        PO_RECEIVED = 'po_received', 'PO Received'
        PIF_SENT = 'pif_sent', 'PIF Sent'
        DOCS_PREPARING = 'docs_preparing', 'Documents Preparing'
        DOCS_APPROVED = 'docs_approved', 'Documents Approved'
        FACTORY_READY = 'factory_ready', 'Product Readiness'
        CONTAINER_BOOKED = 'container_booked', 'Container Booked'
        INSPECTION = 'inspection', 'Under Inspection'
        INSPECTION_PASSED = 'inspection_passed', 'Inspection Status'
        DISPATCHED = 'dispatched', 'Dispatched'
        IN_TRANSIT = 'in_transit', 'In Transit'
        ARRIVED = 'arrived', 'Delivered'
        CUSTOMS = 'customs', 'Customs Clearance'
        DELIVERED = 'delivered', 'Delivered'
        CANCELLED = 'cancelled', 'Cancelled'

    class OrderType(models.TextChoices):
        DIRECT = 'direct', 'Direct Order'
        PI_BASED = 'pi_based', 'PI Based'

    order_number = models.CharField(max_length=50, unique=True, db_index=True)
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='orders')
    quotation = models.ForeignKey('quotations.Quotation', on_delete=models.SET_NULL, null=True, blank=True)
    order_type = models.CharField(max_length=20, choices=OrderType.choices, default=OrderType.DIRECT)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.CONFIRMED)
    currency = models.CharField(max_length=3, default='USD')
    delivery_terms = models.CharField(max_length=20, default='FOB')
    payment_terms = models.CharField(max_length=30, blank=True)
    freight_terms = models.CharField(max_length=20, blank=True)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_orders')

    # PO / Signed PI
    po_document = models.FileField(upload_to='purchase_orders/%Y/%m/', blank=True, null=True)
    po_number = models.CharField(max_length=100, blank=True)
    po_received_date = models.DateField(null=True, blank=True)

    # Product-readiness checklist — items must all be checked before Documents Preparing.
    # Shape: [{ 'label': 'Product', 'checked': False, 'required': True }, ...]
    readiness_checklist = models.JSONField(default=list, blank=True)

    # CRO (Container Release Order) reminder tracking — nudged every 2h after Container Booked
    last_cro_reminder_at = models.DateTimeField(null=True, blank=True)
    # Transit-document reminders (BL, Shipping Bill, Schedule List, COO) —
    # nudged every 2h after Dispatched until all four are uploaded.
    last_transit_reminder_at = models.DateTimeField(null=True, blank=True)

    # Delivery acknowledgment reminder — fired once before estimated delivery
    delivery_reminder_sent_at = models.DateTimeField(null=True, blank=True)

    # Status timestamps (auto-populated by workflow engine)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    pi_sent_at = models.DateTimeField(null=True, blank=True)
    po_received_at = models.DateTimeField(null=True, blank=True)
    pif_sent_at = models.DateTimeField(null=True, blank=True)
    docs_approved_at = models.DateTimeField(null=True, blank=True)
    factory_ready_at = models.DateTimeField(null=True, blank=True)
    container_booked_at = models.DateTimeField(null=True, blank=True)
    inspection_passed_at = models.DateTimeField(null=True, blank=True)
    docs_preparing_at = models.DateTimeField(null=True, blank=True)
    inspection_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    in_transit_at = models.DateTimeField(null=True, blank=True)
    arrived_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    # FIRC (Foreign Inward Remittance Certificate) — final 11th step,
    # marked after delivery + feedback. Drives the shipment progress to 100%.
    firc_received_at = models.DateTimeField(null=True, blank=True)

    # Payment tracking — derived from payment_terms (e.g.
    # "50% advance D/A 60 days"). The advance portion is paid before
    # dispatch; the balance falls due `balance_due_days` after the
    # dispatched_at timestamp. Reminders fire 10 days before due.
    advance_payment_received_at = models.DateTimeField(null=True, blank=True)
    balance_payment_received_at = models.DateTimeField(null=True, blank=True)
    balance_reminder_sent_at = models.DateTimeField(null=True, blank=True)
    # One-shot overdue reminders — fire on the day after the payment due date
    # (e.g. day 61 for a 60-day term) and never fire again for the same row.
    balance_overdue_reminder_sent_at = models.DateTimeField(null=True, blank=True)
    advance_overdue_reminder_sent_at = models.DateTimeField(null=True, blank=True)
    # Per-payment phase overrides — the parser suggests defaults (advance
    # before, balance after) but the executive can flip either side via the
    # Payment Tracking card. The dispatch gate honors these choices.
    advance_is_before_dispatch = models.BooleanField(default=True)
    balance_is_before_dispatch = models.BooleanField(default=False)
    # When True, each product needs TWO COA + TWO MSDS (one tagged
    # _Client, one tagged _Logistic). When False, a single shared doc
    # satisfies both audiences. Toggled from the Documents Preparing card.
    separate_coa_msds_per_group = models.BooleanField(default=False)

    # Source email thread — used by the email service to keep all order-stage
    # emails (PI, Sales Order, dispatch, transit, delivery) threaded with the
    # original client inquiry that started the conversation.
    source_communication = models.ForeignKey(
        'communications.Communication', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='orders',
        help_text='Inbound client email thread this order belongs to (drives email threading).',
    )

    class Meta:
        db_table = 'orders'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.order_number} - {self.client.company_name}"


class OrderItem(models.Model):
    id = models.AutoField(primary_key=True)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
    product_name = models.CharField(max_length=255, help_text='Company/internal product name')
    client_product_name = models.CharField(max_length=255, blank=True, default='', help_text='Product name as the client calls it')
    description = models.TextField(blank=True)
    quantity = models.DecimalField(max_digits=12, decimal_places=2, default=1)
    unit = models.CharField(max_length=20, default='KG')
    unit_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_price = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        db_table = 'order_items'

    def save(self, *args, **kwargs):
        self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)


class OrderStatusHistory(TimeStampedModel):
    """Audit trail — every status change is logged here."""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='status_history')
    from_status = models.CharField(max_length=30)
    to_status = models.CharField(max_length=30)
    changed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    remarks = models.TextField(blank=True)

    class Meta:
        db_table = 'order_status_history'
        ordering = ['created_at']

    def __str__(self):
        return f"{self.order.order_number}: {self.from_status} → {self.to_status}"


class OrderDocument(TimeStampedModel):
    """Documents attached to an order (PI, PO, invoice, packing list, etc.)"""
    class DocType(models.TextChoices):
        PI = 'pi', 'Proforma Invoice'
        PIF = 'pif', 'Packing Instructions Form'
        PO = 'po', 'Purchase Order'
        COMMERCIAL_INVOICE = 'commercial_invoice', 'Commercial Invoice'
        PACKING_LIST = 'packing_list', 'Packing List'
        BL = 'bl', 'Bill of Lading'
        COA = 'coa', 'Certificate of Analysis'
        INSURANCE = 'insurance', 'Insurance Certificate'
        NOTE_ATTACHMENT = 'note_attachment', 'Note Attachment'
        # Docs Preparing checklist doc types
        CLIENT_INVOICE = 'client_invoice', 'Client Invoice'
        CLIENT_PACKING_LIST = 'client_packing_list', 'Client Packing List'
        LOGISTIC_INVOICE = 'logistic_invoice', 'Logistic Invoice'
        LOGISTIC_PACKING_LIST = 'logistic_packing_list', 'Logistic Packing List'
        MSDS = 'msds', 'Material Safety Data Sheet'
        DBK_DECLARATION = 'dbk_declaration', 'DBK Declaration'
        EXAMINATION_REPORT = 'examination_report', 'Examination Report'
        EXPORT_DECLARATION = 'export_declaration', 'Export Declaration Form'
        FACTORY_STUFFING = 'factory_stuffing', 'Factory Stuffing'
        NON_DG_DECLARATION = 'non_dg_declaration', 'Non-DG Declaration'
        CRO = 'cro', 'Container Release Order'
        SHIPPING_BILL = 'shipping_bill', 'Shipping Bill'
        SCHEDULE_LIST = 'schedule_list', 'Schedule List'
        COO = 'coo', 'Certificate of Origin'
        OTHER = 'other', 'Other'

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='order_documents')
    order_item = models.ForeignKey(
        'orders.OrderItem', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='documents',
    )
    doc_type = models.CharField(max_length=30, choices=DocType.choices)
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to='order_documents/%Y/%m/')
    uploaded_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    is_deleted = models.BooleanField(default=False)
    deleted_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'order_documents'
        ordering = ['-created_at']


class WorkflowEventLog(TimeStampedModel):
    """Logs all workflow events — status changes, emails sent, docs uploaded."""
    class EventType(models.TextChoices):
        STATUS_CHANGE = 'status_change', 'Status Change'
        EMAIL_SENT = 'email_sent', 'Email Sent'
        DOC_UPLOADED = 'doc_uploaded', 'Document Uploaded'
        PAYMENT_RECEIVED = 'payment_received', 'Payment Received'
        NOTE = 'note', 'Note'

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='events')
    event_type = models.CharField(max_length=30, choices=EventType.choices)
    description = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    triggered_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'workflow_event_logs'
        ordering = ['created_at']


class EmailLog(TimeStampedModel):
    """Tracks every email sent from the system."""
    order = models.ForeignKey(Order, on_delete=models.CASCADE, null=True, blank=True, related_name='email_logs')
    to_email = models.EmailField()
    cc = models.TextField(blank=True)
    subject = models.CharField(max_length=500)
    body = models.TextField()
    status = models.CharField(max_length=20, default='sent')
    error = models.TextField(blank=True)
    triggered_by = models.CharField(max_length=50, blank=True, help_text='status_change, manual, etc.')

    class Meta:
        db_table = 'email_logs'
        ordering = ['-created_at']


class OrderFeedback(TimeStampedModel):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='feedback')
    comments = models.TextField(blank=True)
    issues = models.TextField(blank=True)
    bulk_order_interest = models.BooleanField(default=False)

    class Meta:
        db_table = 'order_feedback'
