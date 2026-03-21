from django.db import models
from common.models import TimeStampedModel


class Sample(TimeStampedModel):
    class Status(models.TextChoices):
        REQUESTED = 'requested', 'Requested'
        PREPARED = 'prepared', 'Prepared'
        DISPATCHED = 'dispatched', 'Dispatched'
        DELIVERED = 'delivered', 'Delivered'
        FEEDBACK_PENDING = 'feedback_pending', 'Feedback Pending'
        FEEDBACK_RECEIVED = 'feedback_received', 'Feedback Received'

    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='samples')
    product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
    product_name = models.CharField(max_length=255, blank=True)
    quantity = models.CharField(max_length=100, blank=True)
    dispatch_date = models.DateField(null=True, blank=True)
    courier_details = models.CharField(max_length=255, blank=True)
    tracking_number = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.REQUESTED)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'samples'
        ordering = ['-created_at']


class SampleFeedback(TimeStampedModel):
    sample = models.OneToOneField(Sample, on_delete=models.CASCADE, related_name='feedback')
    rating = models.IntegerField(null=True, blank=True)
    comments = models.TextField(blank=True)
    issues = models.TextField(blank=True)
    bulk_order_interest = models.BooleanField(default=False)

    class Meta:
        db_table = 'sample_feedback'
