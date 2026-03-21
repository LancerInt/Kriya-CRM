from django.contrib import admin
from .models import Sample, SampleFeedback

@admin.register(Sample)
class SampleAdmin(admin.ModelAdmin):
    list_display = ['client', 'product_name', 'status', 'dispatch_date', 'created_at']
    list_filter = ['status']
