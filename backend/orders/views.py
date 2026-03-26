from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from .models import Order, OrderDocument, OrderStatusHistory, WorkflowEventLog, EmailLog
from .serializers import (
    OrderSerializer, OrderDocumentSerializer, OrderStatusHistorySerializer,
    WorkflowEventSerializer, EmailLogSerializer,
)


class OrderViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    filterset_fields = ['client', 'status']
    search_fields = ['order_number']

    def get_queryset(self):
        qs = Order.objects.filter(is_deleted=False).select_related('client', 'created_by', 'quotation').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(client__in=client_ids)
        return qs

    # ── Status Transition ──
    @action(detail=True, methods=['post'], url_path='transition')
    def transition(self, request, pk=None):
        """Move order to next status via workflow engine."""
        order = self.get_object()
        new_status = request.data.get('status')
        remarks = request.data.get('remarks', '')

        if not new_status:
            return Response({'error': 'Status is required'}, status=status.HTTP_400_BAD_REQUEST)

        from .workflow_service import transition_order, WorkflowError
        try:
            order = transition_order(order, new_status, request.user, remarks)
            return Response(OrderSerializer(order).data)
        except WorkflowError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Timeline ──
    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        """Get visual timeline of order statuses."""
        order = self.get_object()
        from .workflow_service import get_order_timeline
        return Response(get_order_timeline(order))

    # ── Status History (audit log) ──
    @action(detail=True, methods=['get'], url_path='status-history')
    def status_history(self, request, pk=None):
        order = self.get_object()
        history = order.status_history.select_related('changed_by').all()
        return Response(OrderStatusHistorySerializer(history, many=True).data)

    # ── Workflow Events ──
    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        order = self.get_object()
        events = order.events.select_related('triggered_by').all()
        return Response(WorkflowEventSerializer(events, many=True).data)

    # ── Email Logs ──
    @action(detail=True, methods=['get'], url_path='email-logs')
    def email_logs(self, request, pk=None):
        order = self.get_object()
        logs = order.email_logs.all()
        return Response(EmailLogSerializer(logs, many=True).data)

    # ── Upload PO ──
    @action(detail=True, methods=['post'], url_path='upload-po')
    def upload_po(self, request, pk=None):
        order = self.get_object()
        po_file = request.FILES.get('po_document')
        po_number = request.data.get('po_number', '')

        if not po_file:
            return Response({'error': 'PO document is required'}, status=status.HTTP_400_BAD_REQUEST)

        order.po_document = po_file
        order.po_number = po_number
        order.save(update_fields=['po_document', 'po_number'])

        # Also create OrderDocument record
        OrderDocument.objects.create(
            order=order, doc_type='po', name=po_file.name,
            file=po_file, uploaded_by=request.user,
        )

        # Log event
        WorkflowEventLog.objects.create(
            order=order, event_type='doc_uploaded',
            description=f'PO document uploaded: {po_file.name}',
            metadata={'filename': po_file.name, 'po_number': po_number},
            triggered_by=request.user,
        )

        return Response({'status': 'PO uploaded', 'po_number': po_number})

    # ── Upload Document ──
    @action(detail=True, methods=['post'], url_path='upload-document')
    def upload_document(self, request, pk=None):
        order = self.get_object()
        doc_file = request.FILES.get('file')
        doc_type = request.data.get('doc_type', 'other')
        name = request.data.get('name', doc_file.name if doc_file else '')

        if not doc_file:
            return Response({'error': 'File is required'}, status=status.HTTP_400_BAD_REQUEST)

        doc = OrderDocument.objects.create(
            order=order, doc_type=doc_type, name=name,
            file=doc_file, uploaded_by=request.user,
        )

        WorkflowEventLog.objects.create(
            order=order, event_type='doc_uploaded',
            description=f'Document uploaded: {name} ({doc_type})',
            metadata={'filename': name, 'doc_type': doc_type},
            triggered_by=request.user,
        )

        return Response(OrderDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    # ── Download PDF ──
    @action(detail=True, methods=['get'], url_path='download-pdf')
    def download_pdf(self, request, pk=None):
        order = self.get_object()
        from common.pdf_utils import generate_order_pdf
        pdf_buffer = generate_order_pdf(order)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{order.order_number}.pdf"'
        return response
