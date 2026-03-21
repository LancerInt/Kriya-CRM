from django.contrib import admin
from .models import Client, Contact, ClientPort, ClientAssignment


class ContactInline(admin.TabularInline):
    model = Contact
    extra = 0


class PortInline(admin.TabularInline):
    model = ClientPort
    extra = 0


@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ['company_name', 'country', 'status', 'primary_executive', 'preferred_currency', 'created_at']
    list_filter = ['status', 'country', 'preferred_currency']
    search_fields = ['company_name', 'country']
    inlines = [ContactInline, PortInline]


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ['name', 'client', 'email', 'phone', 'is_primary']
    list_filter = ['is_primary']
    search_fields = ['name', 'email']
