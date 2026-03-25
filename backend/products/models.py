from django.db import models
from common.models import SoftDeleteModel


class Product(SoftDeleteModel):
    name = models.CharField(max_length=255, db_index=True)
    hsn_code = models.CharField(max_length=20, blank=True, help_text='HSN/HS Code')
    category = models.CharField(max_length=100, blank=True)
    active_ingredient = models.CharField(max_length=255, blank=True)
    concentration = models.CharField(max_length=50, blank=True)
    description = models.TextField(blank=True)
    base_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default='USD')
    unit = models.CharField(max_length=20, default='MT')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'products'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.concentration})" if self.concentration else self.name


class ProductDocument(models.Model):
    id = models.AutoField(primary_key=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='documents')
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to='product_docs/%Y/%m/')
    doc_type = models.CharField(max_length=50, blank=True, help_text='regulatory, technical, etc.')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'product_documents'


class CountryCompliance(models.Model):
    id = models.AutoField(primary_key=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='compliance_rules')
    country = models.CharField(max_length=100, db_index=True)
    is_allowed = models.BooleanField(default=True)
    notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'country_compliance'
        unique_together = ('product', 'country')
