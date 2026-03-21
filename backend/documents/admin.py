from django.contrib import admin
from .models import Document

@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'client', 'order', 'version', 'created_at']
    list_filter = ['category']
