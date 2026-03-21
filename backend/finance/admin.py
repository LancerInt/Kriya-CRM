from django.contrib import admin
from .models import Invoice, InvoiceItem, Payment, FIRCRecord, GSTRecord

class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0

@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'client', 'invoice_type', 'status', 'total', 'due_date']
    list_filter = ['invoice_type', 'status']
    inlines = [InvoiceItemInline]

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['client', 'amount', 'currency', 'mode', 'payment_date']
    list_filter = ['mode']
