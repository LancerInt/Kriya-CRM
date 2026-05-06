from django.db import models
from common.models import TimeStampedModel


class Sample(TimeStampedModel):
    class Status(models.TextChoices):
        REQUESTED = 'requested', 'Mail Received'
        REPLIED = 'replied', 'Reply Sent'
        PREPARED = 'prepared', 'Prepared'
        PAYMENT_RECEIVED = 'payment_received', 'Payment Received'
        DISPATCHED = 'dispatched', 'Dispatched'
        DELIVERED = 'delivered', 'Delivered'
        FEEDBACK_PENDING = 'feedback_pending', 'Feedback Pending'
        FEEDBACK_RECEIVED = 'feedback_received', 'Feedback Received'

    class SampleType(models.TextChoices):
        FREE = 'free', 'Free Sample'
        PAID = 'paid', 'Paid Sample'

    sample_number = models.CharField(max_length=20, unique=True, blank=True, default='', db_index=True, help_text='Human-readable shipment number, e.g. SMP-00001')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='samples')
    product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
    product_name = models.CharField(max_length=255, blank=True)
    client_product_name = models.CharField(max_length=255, blank=True, default='', help_text='Product name as the client calls it')
    quantity = models.CharField(max_length=100, blank=True)
    replied_at = models.DateTimeField(null=True, blank=True, help_text='When we sent the reply email acknowledging the request')
    reminder_sent_at = models.DateTimeField(null=True, blank=True, help_text='When the post-reply follow-up reminder was sent to the executive')
    prepared_at = models.DateTimeField(null=True, blank=True)
    dispatch_date = models.DateField(null=True, blank=True)
    dispatch_notified_at = models.DateTimeField(null=True, blank=True, help_text='When the client was notified about dispatch via email')
    delivered_at = models.DateTimeField(null=True, blank=True)
    feedback_reminder_sent_at = models.DateTimeField(null=True, blank=True, help_text='When the post-delivery feedback reminder was sent to the executive/admin/manager')
    courier_details = models.CharField(max_length=255, blank=True)
    tracking_number = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.REQUESTED)
    # Paid samples follow a longer flow: Mail Received → Reply → Prepared →
    # Payment Received → Dispatched (with FIRC) → Delivered → Feedback.
    # Free samples skip the Reply / Payment / FIRC stages.
    sample_type = models.CharField(
        max_length=10, choices=SampleType.choices, blank=True, default='',
        help_text='Free samples skip the reply/payment stages; paid samples include them and FIRC.',
    )
    # Once an executive picks Free or Paid, the type is locked — accidental
    # mid-flight switches between paid/free are not allowed.
    sample_type_locked = models.BooleanField(default=False)
    payment_received_at = models.DateTimeField(null=True, blank=True)
    firc_received_at = models.DateTimeField(null=True, blank=True, help_text='FIRC received for paid samples — recorded at Dispatched stage.')
    notes = models.TextField(blank=True)
    source_communication = models.ForeignKey(
        'communications.Communication', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='samples', help_text='The inbound email this sample request came from',
    )
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'samples'
        ordering = ['-created_at']


class SampleItem(models.Model):
    """Individual product line on a Sample request.

    A single Sample can contain multiple products the client asked for in
    one email — e.g. "send me a sample of Neem Oil and Karanja Oil". Each
    product becomes a separate SampleItem row sharing the same parent
    Sample. The legacy Sample.product_name / Sample.quantity fields are
    kept for backward compatibility (mirrored from the first item where
    relevant) but new code should iterate over Sample.items.
    """
    id = models.AutoField(primary_key=True)
    sample = models.ForeignKey(Sample, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
    product_name = models.CharField(max_length=255, blank=True, default='', help_text='Company product name')
    client_product_name = models.CharField(max_length=255, blank=True, default='', help_text='Product name as the client calls it')
    quantity = models.CharField(max_length=100, blank=True, default='', help_text='e.g. "5 KG", "2 LTR"')
    notes = models.TextField(blank=True, default='')

    class Meta:
        db_table = 'sample_items'
        ordering = ['id']

    def __str__(self):
        return f'{self.product_name or "(no product)"} — {self.quantity or "(no qty)"}'


class SampleDocument(TimeStampedModel):
    """Documents attached to a sample (COA, MSDS, etc.)"""
    class DocType(models.TextChoices):
        COA = 'coa', 'Certificate of Analysis'
        MSDS = 'msds', 'Material Safety Data Sheet'
        OTHER = 'other', 'Other'

    sample = models.ForeignKey(Sample, on_delete=models.CASCADE, related_name='documents')
    doc_type = models.CharField(max_length=20, choices=DocType.choices)
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to='sample_documents/%Y/%m/')
    uploaded_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'sample_documents'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_doc_type_display()} - {self.name}'


class SampleFeedback(TimeStampedModel):
    sample = models.OneToOneField(Sample, on_delete=models.CASCADE, related_name='feedback')
    rating = models.IntegerField(null=True, blank=True)
    comments = models.TextField(blank=True)
    issues = models.TextField(blank=True)
    bulk_order_interest = models.BooleanField(default=False)

    class Meta:
        db_table = 'sample_feedback'
