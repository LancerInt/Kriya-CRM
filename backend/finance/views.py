from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from .models import Invoice, Payment, FIRCRecord, GSTRecord, ProformaInvoice, CommercialInvoice
from .serializers import (InvoiceSerializer, PaymentSerializer, FIRCRecordSerializer,
                          GSTRecordSerializer, ProformaInvoiceSerializer,
                          CommercialInvoiceSerializer)


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


class ProformaInvoiceViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = ProformaInvoiceSerializer
    filterset_fields = ['client', 'order', 'status']

    def get_queryset(self):
        qs = ProformaInvoice.objects.filter(is_deleted=False).select_related('client', 'order').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    @action(detail=True, methods=['post'], url_path='save-with-items')
    def save_with_items(self, request, pk=None):
        """Save PI fields + replace all items in one request."""
        from .models import ProformaInvoiceItem
        pi = self.get_object()
        data = dict(request.data)
        items_data = data.pop('items', None)

        allowed = {
            'invoice_date', 'status', 'client_company_name', 'client_tax_number',
            'client_address', 'client_pincode', 'client_city_state_country', 'client_phone',
            'country_of_origin', 'country_of_final_destination', 'port_of_loading',
            'port_of_discharge', 'vessel_flight_no', 'final_destination',
            'terms_of_trade', 'terms_of_delivery', 'buyer_reference',
            'currency', 'amount_in_words', 'bank_details', 'display_overrides',
        }
        for field in allowed:
            if field in data:
                setattr(pi, field, data[field])

        if items_data is not None:
            pi.items.all().delete()
            total = 0
            for item_data in items_data:
                qty = float(item_data.get('quantity', 0) or 0)
                price = float(item_data.get('unit_price', 0) or 0)
                line_total = qty * price
                total += line_total
                ProformaInvoiceItem.objects.create(
                    pi=pi,
                    product_name=item_data.get('product_name', ''),
                    packages_description=item_data.get('packages_description', ''),
                    description_of_goods=item_data.get('description_of_goods', ''),
                    quantity=qty,
                    unit=item_data.get('unit', 'Ltrs'),
                    unit_price=price,
                    total_price=line_total,
                )
            pi.total = total
            # Auto-update amount_in_words with grand total (including freight/insurance/discount)
            ov = pi.display_overrides if isinstance(pi.display_overrides, dict) else {}
            freight = float(ov.get('_freight', 0) or 0)
            insurance = float(ov.get('_insurance', 0) or 0)
            discount = float(ov.get('_discount', 0) or 0)
            grand_total = total + freight + insurance - discount
            from finance.pi_service import _number_to_words
            pi.amount_in_words = _number_to_words(grand_total, pi.currency)
        pi.save()
        return Response(ProformaInvoiceSerializer(pi).data)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        """Create a PI from an order, auto-filling client data."""
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        from orders.models import Order
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        from .pi_service import create_pi_from_order
        pi = create_pi_from_order(order, request.user)
        return Response(ProformaInvoiceSerializer(pi).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        """Generate and return PI PDF."""
        pi = self.get_object()
        from .pi_service import generate_pi_pdf
        pdf_buffer = generate_pi_pdf(pi)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="PI_{pi.invoice_number.replace("/", "-")}_{pi.client_company_name.replace(" ", "_")}.pdf"'
        return response

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        """Generate PDF and send to client via email."""
        pi = self.get_object()
        from .pi_service import send_pi_email
        try:
            sent_to = send_pi_email(pi, request.user)
            return Response({'status': 'sent', 'sent_to': sent_to})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=['post'], url_path='convert-to-order')
    def convert_to_order(self, request, pk=None):
        """Convert a Proforma Invoice into an Order."""
        from orders.models import Order, OrderItem
        pi = self.get_object()

        # Check if order already exists for this PI
        if pi.order:
            from orders.serializers import OrderSerializer
            return Response(OrderSerializer(pi.order).data)

        # Generate order number
        order_count = Order.objects.count() + 1
        order = Order.objects.create(
            order_number=f'ORD-{order_count:05d}',
            client=pi.client,
            order_type='pi_based',
            currency=pi.currency,
            delivery_terms=pi.terms_of_delivery.split(' - ')[0].strip() if pi.terms_of_delivery else 'FOB',
            payment_terms=pi.terms_of_trade or '',
            total=pi.total,
            notes=f'Converted from PI {pi.invoice_number}',
            created_by=request.user,
        )

        for item in pi.items.all():
            OrderItem.objects.create(
                order=order,
                product_name=item.product_name,
                client_product_name=item.client_product_name,
                description=item.description_of_goods or '',
                quantity=item.quantity,
                unit=item.unit,
                unit_price=item.unit_price,
                total_price=item.total_price,
            )

        # Link PI to order
        pi.order = order
        pi.save(update_fields=['order'])

        from orders.serializers import OrderSerializer
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='create-standalone')
    def create_standalone(self, request):
        """Create a standalone PI (not from an order) for a client."""
        from .models import ProformaInvoiceItem
        from .pi_service import DEFAULT_BANK
        from datetime import date as dt_date

        client_id = request.data.get('client_id')
        if not client_id:
            return Response({'error': 'client_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        from clients.models import Client
        try:
            client = Client.objects.get(id=client_id, is_deleted=False)
        except Client.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)

        count = ProformaInvoice.objects.count() + 1
        today = dt_date.today()
        invoice_number = f'{today.strftime("%y-%m")}/KB-{count:03d}'

        pi = ProformaInvoice.objects.create(
            client=client,
            invoice_number=invoice_number,
            invoice_date=today,
            created_by=request.user,
            client_company_name=client.company_name,
            client_tax_number=client.tax_number or '',
            client_address=client.address or '',
            client_pincode=client.postal_code or '',
            client_city_state_country=f'{client.city}, {client.state}, {client.country}'.strip(', '),
            client_phone=client.phone_number or '',
            country_of_origin='India',
            country_of_final_destination=client.country or '',
            currency=client.preferred_currency or 'USD',
            bank_details=DEFAULT_BANK,
        )

        # Add one blank item
        ProformaInvoiceItem.objects.create(
            pi=pi,
            product_name='',
            quantity=0,
            unit='Ltrs',
            unit_price=0,
            total_price=0,
        )

        return Response(ProformaInvoiceSerializer(pi).data, status=status.HTTP_201_CREATED)


class CommercialInvoiceViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = CommercialInvoiceSerializer
    filterset_fields = ['client', 'order', 'status']

    def get_queryset(self):
        qs = CommercialInvoice.objects.filter(is_deleted=False).select_related('client', 'order').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    @action(detail=True, methods=['post'], url_path='save-with-items')
    def save_with_items(self, request, pk=None):
        """Save CI fields + replace all items in one request."""
        from .models import CommercialInvoiceItem
        ci = self.get_object()
        data = dict(request.data)
        items_data = data.pop('items', None)

        allowed = {
            'invoice_date', 'status', 'exporter_ref',
            'client_company_name', 'client_tax_number', 'client_address',
            'client_pincode', 'client_city_state_country', 'client_phone',
            'notify_company_name', 'notify_address', 'notify_phone',
            'buyer_order_no', 'buyer_order_date',
            'country_of_origin', 'country_of_final_destination',
            'port_of_loading', 'port_of_discharge', 'vessel_flight_no',
            'final_destination', 'pre_carriage_by', 'place_of_receipt',
            'terms_of_delivery', 'payment_terms',
            'currency', 'exchange_rate', 'freight', 'insurance',
            'total_fob_usd', 'total_fob_inr', 'freight_inr', 'insurance_inr',
            'total_invoice_usd', 'total_invoice_inr',
            'igst_rate', 'igst_amount', 'grand_total_inr',
            'amount_in_words', 'bank_details', 'display_overrides',
        }
        for field in allowed:
            if field in data:
                val = data[field]
                if val == '' and field in ('exchange_rate', 'freight', 'insurance', 'igst_rate',
                                           'igst_amount', 'grand_total_inr', 'total_fob_usd',
                                           'total_fob_inr', 'freight_inr', 'insurance_inr',
                                           'total_invoice_usd', 'total_invoice_inr'):
                    val = 0
                setattr(ci, field, val)

        if items_data is not None:
            ci.items.all().delete()
            total = 0
            for item_data in items_data:
                qty = float(item_data.get('quantity', 0) or 0)
                price = float(item_data.get('unit_price', 0) or 0)
                line_total = qty * price
                total += line_total
                CommercialInvoiceItem.objects.create(
                    ci=ci,
                    product_name=item_data.get('product_name', ''),
                    hsn_code=item_data.get('hsn_code', ''),
                    packages_description=item_data.get('packages_description', ''),
                    description_of_goods=item_data.get('description_of_goods', ''),
                    quantity=qty,
                    unit=item_data.get('unit', 'KG'),
                    unit_price=price,
                    total_price=line_total,
                )
            ci.total_fob_usd = total
            ci.total_invoice_usd = total + float(ci.freight or 0) + float(ci.insurance or 0)
        ci.save()
        return Response(CommercialInvoiceSerializer(ci).data)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        """Create a CI from an order, auto-filling client data."""
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        from orders.models import Order
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        from .ci_service import create_ci_from_order
        ci = create_ci_from_order(order, request.user)
        return Response(CommercialInvoiceSerializer(ci).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        """Generate and return CI PDF."""
        ci = self.get_object()
        from .ci_service import generate_ci_pdf
        pdf_buffer = generate_ci_pdf(ci)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="CI_{ci.invoice_number.replace("/", "-")}_{ci.client_company_name.replace(" ", "_")}.pdf"'
        return response

    @action(detail=True, methods=['post'], url_path='send-email')
    def send_email(self, request, pk=None):
        """Generate PDF and send to client via email."""
        ci = self.get_object()
        from .ci_service import send_ci_email
        try:
            sent_to = send_ci_email(ci, request.user)
            return Response({'status': 'sent', 'sent_to': sent_to})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
