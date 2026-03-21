from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Q
from .models import Client, Contact, ClientPort
from .serializers import (ClientListSerializer, ClientDetailSerializer,
                          ClientCreateSerializer, ContactSerializer, ClientPortSerializer)


class ClientViewSet(viewsets.ModelViewSet):
    filterset_fields = ['status', 'country', 'primary_executive']
    search_fields = ['company_name', 'country', 'city', 'business_type']
    ordering_fields = ['company_name', 'created_at', 'updated_at']

    def get_queryset(self):
        qs = Client.objects.filter(is_deleted=False).select_related('primary_executive')
        user = self.request.user

        if user.role == 'executive':
            qs = qs.filter(
                Q(primary_executive=user) |
                Q(assignments__user=user)
            ).distinct()

        if self.action == 'list':
            qs = qs.annotate(
                contact_count=Count('contacts', filter=Q(contacts__is_deleted=False)),
                order_count=Count('orders')
            )
        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return ClientListSerializer
        if self.action in ['create', 'update', 'partial_update']:
            return ClientCreateSerializer
        return ClientDetailSerializer

    def perform_destroy(self, instance):
        instance.soft_delete()

    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        client = self.get_object()
        from communications.serializers import CommunicationSerializer
        comms = client.communications.select_related('user', 'contact').all()[:50]
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
            'communications': client.communications.count(),
            'quotations': client.quotations.count(),
            'orders': client.orders.count(),
            'tasks': client.tasks.filter(status__in=['pending', 'in_progress']).count(),
            'invoices': client.invoices.count(),
            'samples': client.samples.count(),
        })


class ContactViewSet(viewsets.ModelViewSet):
    serializer_class = ContactSerializer
    filterset_fields = ['client', 'is_primary']

    def get_queryset(self):
        return Contact.objects.filter(is_deleted=False).select_related('client')
