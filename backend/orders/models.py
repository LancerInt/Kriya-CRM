from django.db import models
from common.models import TimeStampedModel


class Order(TimeStampedModel):
    class Status(models.TextChoices):
        CONFIRMED = 'confirmed', 'Confirmed'
        PI_SENT = 'pi_sent', 'PI Sent'
        PO_RECEIVED = 'po_received', 'PO Received'
        DOCS_PREPARING = 'docs_preparing', 'Documents Preparing'
        DOCS_APPROVED = 'docs_approved', 'Documents Approved'
        FACTORY_READY = 'factory_ready', 'Factory Ready'
        CONTAINER_BOOKED = 'container_booked', 'Container Booked'
        INSPECTION = 'inspection', 'Under Inspection'
        PROCESSING = 'processing', 'Processing'
        SHIPPED = 'shipped', 'Shipped'
        DELIVERED = 'delivered', 'Delivered'
        CANCELLED = 'cancelled', 'Cancelled'

    class OrderType(models.TextChoices):
        DIRECT = 'direct', 'Direct Order'
        PI_BASED = 'pi_based', 'PI Based'

    order_number = models.CharField(max_length=50, unique=True, db_index=True)
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='orders')
    quotation = models.ForeignKey('quotations.Quotation', on_delete=models.SET_NULL, null=True, blank=True)
    order_type = models.CharField(max_length=20, choices=OrderType.choices, default=OrderType.DIRECT)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CONFIRMED)
    currency = models.CharField(max_length=3, default='USD')
    delivery_terms = models.CharField(max_length=20, default='FOB')
    payment_terms = models.CharField(max_length=30, blank=True)
    freight_terms = models.CharField(max_length=20, blank=True)
    total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True)

    # PO / Signed PI upload
    po_document = models.FileField(upload_to='purchase_orders/%Y/%m/', blank=True, null=True)
    po_number = models.CharField(max_length=100, blank=True, help_text='Client PO number or signed PI reference')
    po_received_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'orders'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.order_number} - {self.client.company_name}"


class OrderItem(models.Model):
    id = models.AutoField(primary_key=True)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
    product_name = models.CharField(max_length=255)
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
