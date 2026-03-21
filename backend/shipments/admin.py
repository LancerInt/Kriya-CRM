from django.contrib import admin
from .models import Shipment

@admin.register(Shipment)
class ShipmentAdmin(admin.ModelAdmin):
    list_display = ['shipment_number', 'order', 'client', 'status', 'dispatch_date', 'estimated_arrival']
    list_filter = ['status']
