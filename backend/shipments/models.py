from django.db import models
from common.models import TimeStampedModel


class Shipment(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        FACTORY_READY = 'factory_ready', 'Factory Ready'
        CONTAINER_BOOKED = 'container_booked', 'Container Booked'
        PACKED = 'packed', 'Packed'
        INSPECTION = 'inspection', 'Under Inspection'
        INSPECTION_PASSED = 'inspection_passed', 'Inspection Passed'
        DISPATCHED = 'dispatched', 'Dispatched'
        IN_TRANSIT = 'in_transit', 'In Transit'
        ARRIVED = 'arrived', 'Arrived at Port'
        CUSTOMS = 'customs', 'Customs Clearance'
        DELIVERED = 'delivered', 'Delivered'

    shipment_number = models.CharField(max_length=50, unique=True, db_index=True)
    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, related_name='shipments')
    client = models.ForeignKey('clients.Client', on_delete=models.CASCADE, related_name='shipments')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    container_number = models.CharField(max_length=50, blank=True)
    bl_number = models.CharField(max_length=50, blank=True, verbose_name='Bill of Lading')
    forwarder = models.CharField(max_length=255, blank=True)
    shipping_line = models.CharField(max_length=255, blank=True)
    vessel_name = models.CharField(max_length=255, blank=True)
    port_of_loading = models.CharField(max_length=255, blank=True)
    port_of_discharge = models.CharField(max_length=255, blank=True)
    delivery_terms = models.CharField(max_length=20, blank=True)
    freight_type = models.CharField(max_length=20, blank=True)
    dispatch_date = models.DateField(null=True, blank=True)
    transit_days = models.IntegerField(null=True, blank=True)
    estimated_arrival = models.DateField(null=True, blank=True)
    actual_arrival = models.DateField(null=True, blank=True)
    container_booking_date = models.DateField(null=True, blank=True)
    factory_ready_date = models.DateField(null=True, blank=True)
    inspection_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'shipments'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.shipment_number} - {self.status}"
