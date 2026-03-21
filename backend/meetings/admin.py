from django.contrib import admin
from .models import CallLog

@admin.register(CallLog)
class CallLogAdmin(admin.ModelAdmin):
    list_display = ['client', 'user', 'scheduled_at', 'status', 'duration_minutes']
    list_filter = ['status']
