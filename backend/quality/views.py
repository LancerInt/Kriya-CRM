from common.models import SoftDeleteViewMixin
from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db import transaction
from .models import Inspection, COADocument, COAReportCounter
from .serializers import InspectionSerializer, COADocumentSerializer

class InspectionViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = InspectionSerializer
    filterset_fields = ['shipment', 'inspection_type', 'status']
    def get_queryset(self):
        return Inspection.objects.select_related('shipment').prefetch_related('media').all()

class COADocumentViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = COADocumentSerializer
    filterset_fields = ['shipment', 'product', 'coa_type']
    def get_queryset(self):
        return COADocument.objects.select_related('shipment', 'product').all()


@api_view(['GET'])
def coa_next_report_number(request):
    """Return the next COA report number (preview, not consumed)."""
    return Response({'report_number': COAReportCounter.get_next_report_number()})


@api_view(['POST'])
def coa_consume_report_number(request):
    """Consume a COA report number (call when COA is actually sent)."""
    report_no = request.data.get('report_no', '')
    with transaction.atomic():
        final = COAReportCounter.consume_next_report_number(report_no)
    return Response({'report_number': final})
