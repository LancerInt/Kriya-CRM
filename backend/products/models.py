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
    client_brand_names = models.TextField(
        blank=True, default='',
        help_text='Comma-separated alternate names clients use for this product (e.g. aza, azarate, azadin)',
    )
    is_active = models.BooleanField(default=True)

    # Quality / COA specification — list of component dicts:
    #   [{"name": "Neem oil", "standard": 70.0, "acceptable_max": 71.0, "unit": "%"},
    #    {"name": "Spinosad", "standard": 1.2,  "acceptable_max": 1.25, "unit": "%"}]
    # Used by the COA editor to (a) inject per-product rows in the test
    # results table and (b) validate the entered value against acceptable_max.
    # A value > acceptable_max is rejected; a value ≤ acceptable_max is OK
    # regardless of how it compares to the standard.
    quality_spec = models.JSONField(blank=True, default=dict, help_text='COA spec (components + acceptable max)')

    class Meta:
        db_table = 'products'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.concentration})" if self.concentration else self.name


class ProductDocument(models.Model):
    class DocType(models.TextChoices):
        COA = 'coa', 'Certificate of Analysis (COA)'
        MSDS = 'msds', 'Material Safety Data Sheet (MSDS)'
        TDS = 'tds', 'Technical Data Sheet (TDS)'
        CERTIFICATE = 'certificate', 'Certificate'
        BROCHURE = 'brochure', 'Brochure'
        REGULATORY = 'regulatory', 'Regulatory Document'
        TECHNICAL = 'technical', 'Technical Document'
        OTHER = 'other', 'Other'

    id = models.AutoField(primary_key=True)
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='documents')
    name = models.CharField(max_length=255)
    file = models.FileField(upload_to='product_docs/%Y/%m/')
    doc_type = models.CharField(max_length=50, choices=DocType.choices, default=DocType.OTHER, blank=True)
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
