from django.contrib import admin
from .models import Product, ProductDocument, CountryCompliance

class ProductDocumentInline(admin.TabularInline):
    model = ProductDocument
    extra = 0

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'active_ingredient', 'concentration', 'base_price', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'active_ingredient']
    inlines = [ProductDocumentInline]

@admin.register(CountryCompliance)
class CountryComplianceAdmin(admin.ModelAdmin):
    list_display = ['product', 'country', 'is_allowed']
    list_filter = ['is_allowed', 'country']
