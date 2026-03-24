from rest_framework import viewsets
from .models import Inspection, COADocument
from .serializers import InspectionSerializer, COADocumentSerializer

class InspectionViewSet(viewsets.ModelViewSet):
    serializer_class = InspectionSerializer
    filterset_fields = ['shipment', 'inspection_type', 'status']
    def get_queryset(self):
        return Inspection.objects.select_related('shipment').prefetch_related('media').all()

class COADocumentViewSet(viewsets.ModelViewSet):
    serializer_class = COADocumentSerializer
    filterset_fields = ['shipment', 'product', 'coa_type']
    def get_queryset(self):
        return COADocument.objects.select_related('shipment', 'product').all()
