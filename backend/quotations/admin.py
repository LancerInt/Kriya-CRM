from django.contrib import admin
from .models import Inquiry, Quotation, QuotationItem

class QuotationItemInline(admin.TabularInline):
    model = QuotationItem
    extra = 0

@admin.register(Inquiry)
class InquiryAdmin(admin.ModelAdmin):
    list_display = ['client', 'product_name', 'stage', 'source', 'assigned_to', 'expected_value']
    list_filter = ['stage', 'source']

@admin.register(Quotation)
class QuotationAdmin(admin.ModelAdmin):
    list_display = ['quotation_number', 'client', 'status', 'total', 'currency', 'version', 'created_at']
    list_filter = ['status']
    inlines = [QuotationItemInline]
