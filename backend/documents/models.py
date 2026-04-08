from django.db import models
from common.models import TimeStampedModel


class Folder(TimeStampedModel):
    class Visibility(models.TextChoices):
        PRIVATE = 'private', 'Private'
        PUBLIC = 'public', 'Public'

    name = models.CharField(max_length=255)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    visibility = models.CharField(
        max_length=10, choices=Visibility.choices, default=Visibility.PRIVATE,
        help_text='private = visible to creator (and admin/manager); public = visible to everyone',
    )

    class Meta:
        db_table = 'document_folders'
        ordering = ['name']

    def __str__(self):
        return self.name


class Document(TimeStampedModel):
    class Category(models.TextChoices):
        COMMERCIAL = 'commercial', 'Commercial'
        QUALITY = 'quality', 'Quality'
        REGULATORY = 'regulatory', 'Regulatory'
        FINANCIAL = 'financial', 'Financial'
        SAMPLE = 'sample', 'Sample'
        OTHER = 'other', 'Other'

    class Visibility(models.TextChoices):
        PRIVATE = 'private', 'Private'
        PUBLIC = 'public', 'Public'

    folder = models.ForeignKey(Folder, on_delete=models.SET_NULL, null=True, blank=True, related_name='documents')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, null=True, blank=True, related_name='documents')
    order = models.ForeignKey('orders.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='documents')
    shipment = models.ForeignKey('shipments.Shipment', on_delete=models.SET_NULL, null=True, blank=True, related_name='documents')
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OTHER)
    file = models.FileField(upload_to='documents/%Y/%m/')
    filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=100, blank=True)
    file_size = models.IntegerField(default=0)
    version = models.IntegerField(default=1)
    uploaded_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)
    visibility = models.CharField(
        max_length=10, choices=Visibility.choices, default=Visibility.PRIVATE,
        help_text='private = visible to uploader (and admin/manager); public = visible to everyone',
    )

    class Meta:
        db_table = 'documents'
        ordering = ['-created_at']
