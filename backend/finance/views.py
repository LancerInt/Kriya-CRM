from common.models import SoftDeleteViewMixin
from rest_framework import viewsets
from rest_framework.decorators import action
from django.http import HttpResponse
from .models import Invoice, Payment, FIRCRecord, GSTRecord
from .serializers import InvoiceSerializer, PaymentSerializer, FIRCRecordSerializer, GSTRecordSerializer


class InvoiceViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    filterset_fields = ['client', 'order', 'invoice_type', 'status']

    def get_queryset(self):
        qs = Invoice.objects.filter(is_deleted=False).select_related('client', 'order').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    @action(detail=True, methods=['get'], url_path='download-pdf')
    def download_pdf(self, request, pk=None):
        invoice = self.get_object()
        from common.pdf_utils import generate_invoice_pdf
        pdf_buffer = generate_invoice_pdf(invoice)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{invoice.invoice_number}.pdf"'
        return response


class PaymentViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = PaymentSerializer
    filterset_fields = ['client', 'invoice', 'mode']
    def get_queryset(self):
        qs = Payment.objects.filter(is_deleted=False).select_related('client', 'invoice')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

class FIRCRecordViewSet(viewsets.ModelViewSet):
    queryset = FIRCRecord.objects.all()
    serializer_class = FIRCRecordSerializer
    filterset_fields = ['status']

class GSTRecordViewSet(viewsets.ModelViewSet):
    queryset = GSTRecord.objects.all()
    serializer_class = GSTRecordSerializer
    filterset_fields = ['status']
