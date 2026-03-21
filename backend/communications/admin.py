from django.contrib import admin
from .models import Communication, CommunicationAttachment

@admin.register(Communication)
class CommunicationAdmin(admin.ModelAdmin):
    list_display = ['subject', 'client', 'comm_type', 'direction', 'user', 'created_at']
    list_filter = ['comm_type', 'direction']
    search_fields = ['subject', 'body']
