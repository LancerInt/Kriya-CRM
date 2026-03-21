from django.db import models
from common.models import TimeStampedModel


class Inspection(TimeStampedModel):
    class Type(models.TextChoices):
        PRE_DISPATCH = 'pre_dispatch', 'Pre-Dispatch'
        CONTAINER_LOADING = 'container_loading', 'Container Loading'
        THIRD_PARTY = 'third_party', 'Third Party'

    class Status(models.TextChoices):
        PASSED = 'passed', 'Passed'
        CONDITIONAL = 'conditional', 'Conditional'
        FAILED = 'failed', 'Failed'
        PENDING = 'pending', 'Pending'

    shipment = models.ForeignKey('shipments.Shipment', on_delete=models.CASCADE, related_name='inspections')
    inspection_date = models.DateField()
    inspector_name = models.CharField(max_length=255)
    inspection_type = models.CharField(max_length=30, choices=Type.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'inspections'


class InspectionMedia(models.Model):
    id = models.AutoField(primary_key=True)
    inspection = models.ForeignKey(Inspection, on_delete=models.CASCADE, related_name='media')
    file = models.FileField(upload_to='inspections/%Y/%m/')
    media_type = models.CharField(max_length=20, default='photo')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inspection_media'


class COADocument(TimeStampedModel):
    shipment = models.ForeignKey('shipments.Shipment', on_delete=models.CASCADE, null=True, blank=True, related_name='coa_documents')
    product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
    coa_type = models.CharField(max_length=20, default='lab', help_text='lab or client')
    file = models.FileField(upload_to='coa/%Y/%m/')
    version = models.IntegerField(default=1)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'coa_documents'
