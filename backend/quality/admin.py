from django.contrib import admin
from .models import Inspection, InspectionMedia, COADocument

@admin.register(Inspection)
class InspectionAdmin(admin.ModelAdmin):
    list_display = ['shipment', 'inspection_type', 'status', 'inspection_date', 'inspector_name']
    list_filter = ['inspection_type', 'status']
