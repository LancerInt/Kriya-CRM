from django.contrib import admin
from .models import Communication, CommunicationAttachment, EmailAccount, WhatsAppConfig


@admin.register(Communication)
class CommunicationAdmin(admin.ModelAdmin):
    list_display = ['subject', 'client', 'comm_type', 'direction', 'user', 'created_at']
    list_filter = ['comm_type', 'direction']
    search_fields = ['subject', 'body']


@admin.register(EmailAccount)
class EmailAccountAdmin(admin.ModelAdmin):
    list_display = ['email', 'display_name', 'user', 'is_active', 'last_synced', 'created_at']
    list_filter = ['is_active']
    search_fields = ['email', 'display_name', 'username']


@admin.register(WhatsAppConfig)
class WhatsAppConfigAdmin(admin.ModelAdmin):
    list_display = ['phone_number_id', 'business_account_id', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['phone_number_id', 'business_account_id']
