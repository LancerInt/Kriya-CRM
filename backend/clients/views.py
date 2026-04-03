from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Q, Value, CharField, Case, When
from .models import Client, Contact, ClientPort, ClientPriceList, PurchaseHistory
from .serializers import (ClientListSerializer, ClientDetailSerializer,
                          ClientCreateSerializer, ContactSerializer, ClientPortSerializer,
                          ClientPriceListSerializer, PurchaseHistorySerializer)


def get_client_qs_for_user(user, base_qs=None):
    """Return filtered client queryset based on user role."""
    if base_qs is None:
        base_qs = Client.objects.filter(is_deleted=False)

    if user.role == 'executive':
        return base_qs.filter(
            Q(primary_executive=user) |
            Q(shadow_executive=user) |
            Q(assignments__user=user)
        ).distinct()
    # Admin and manager see everything
    return base_qs


from notifications.helpers import notify


class ClientViewSet(viewsets.ModelViewSet):
    filterset_fields = ['status', 'country', 'primary_executive']
    search_fields = ['company_name', 'country', 'city', 'business_type']
    ordering_fields = ['company_name', 'created_at', 'updated_at']

    def get_queryset(self):
        qs = Client.objects.filter(is_deleted=False).select_related('primary_executive', 'shadow_executive')
        user = self.request.user
        qs = get_client_qs_for_user(user, qs)

        if self.action == 'list':
            qs = qs.annotate(
                contact_count=Count('contacts', filter=Q(contacts__is_deleted=False)),
                order_count=Count('orders', filter=Q(orders__is_deleted=False)),
            )
            # For executives, add client_role annotation
            if user.role == 'executive':
                qs = qs.annotate(
                    client_role=Case(
                        When(primary_executive=user, then=Value('primary')),
                        When(shadow_executive=user, then=Value('shadow')),
                        default=Value('assigned'),
                        output_field=CharField(),
                    )
                )
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return ClientListSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return ClientCreateSerializer
        return ClientDetailSerializer

    def perform_create(self, serializer):
        client = serializer.save()
        notify(
            title=f'New account added: {client.company_name}',
            message=f'{self.request.user.full_name} added a new account.',
            notification_type='system', link=f'/clients/{client.id}',
            actor=self.request.user, client=client,
        )

    def perform_update(self, serializer):
        user = self.request.user
        if user.role == 'executive':
            for field in ('primary_executive', 'shadow_executive'):
                if field in serializer.validated_data:
                    serializer.validated_data.pop(field)
        client = serializer.save()
        notify(
            title=f'Account updated: {client.company_name}',
            message=f'{user.full_name} updated account details.',
            notification_type='system', link=f'/clients/{client.id}',
            actor=user, client=client,
        )

    def perform_destroy(self, instance):
        instance.soft_delete()
        notify(
            title=f'Account deleted: {instance.company_name}',
            message=f'{self.request.user.full_name} deleted this account.',
            notification_type='alert', actor=self.request.user, client=instance,
        )

    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        client = self.get_object()
        from communications.serializers import CommunicationSerializer
        comms = client.communications.filter(is_deleted=False).select_related('user', 'contact').all()[:50]
        return Response(CommunicationSerializer(comms, many=True).data)

    @action(detail=True, methods=['post'])
    def add_contact(self, request, pk=None):
        client = self.get_object()
        serializer = ContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(client=client)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        client = self.get_object()
        return Response({
            'communications': client.communications.filter(is_deleted=False).count(),
            'quotations': client.quotations.filter(is_deleted=False).count(),
            'orders': client.orders.filter(is_deleted=False).count(),
            'tasks': client.tasks.filter(is_deleted=False, status__in=['pending', 'in_progress']).count(),
            'invoices': client.invoices.filter(is_deleted=False).count(),
            'samples': client.samples.filter(is_deleted=False).count(),
        })

    @action(detail=True, methods=['get'], url_path='product-price')
    def product_price(self, request, pk=None):
        """Get client-specific price for a product. Falls back to base price."""
        client = self.get_object()
        product_id = request.query_params.get('product_id')
        product_name = request.query_params.get('product_name', '')

        from products.models import Product
        price_entry = None

        if product_id:
            price_entry = ClientPriceList.objects.filter(
                client=client, product_id=product_id, is_deleted=False
            ).first()
        if not price_entry and product_name:
            price_entry = ClientPriceList.objects.filter(
                client=client, product_name__iexact=product_name, is_deleted=False
            ).first()

        if price_entry:
            return Response({
                'unit_price': str(price_entry.unit_price),
                'currency': price_entry.currency,
                'unit': price_entry.unit,
                'source': 'client_price_list',
                'client_product_name': price_entry.client_product_name,
            })

        # Fallback to product base price
        product = None
        if product_id:
            product = Product.objects.filter(id=product_id, is_deleted=False).first()
        if product:
            return Response({
                'unit_price': str(product.base_price),
                'currency': product.currency,
                'unit': product.unit,
                'source': 'product_base_price',
                'client_product_name': '',
            })

        return Response({'unit_price': '0', 'currency': 'USD', 'unit': 'KG', 'source': 'none', 'client_product_name': ''})


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    filterset_fields = ['client', 'is_primary']

    def get_queryset(self):
        return Contact.objects.filter(is_deleted=False).select_related('client')


class ClientPriceListViewSet(viewsets.ModelViewSet):
    serializer_class = ClientPriceListSerializer
    filterset_fields = ['client', 'product', 'currency']
    search_fields = ['product_name', 'client_product_name']

    def get_queryset(self):
        return ClientPriceList.objects.filter(is_deleted=False).select_related('product', 'client')

    def perform_destroy(self, instance):
        instance.soft_delete()


class PurchaseHistoryViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseHistorySerializer
    filterset_fields = ['client', 'product', 'status']
    search_fields = ['product_name', 'invoice_number']

    def get_queryset(self):
        return PurchaseHistory.objects.filter(is_deleted=False).select_related('order', 'product', 'client')

    def perform_destroy(self, instance):
        instance.soft_delete()
