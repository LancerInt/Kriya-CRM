from rest_framework import viewsets
from .models import Inspection, COADocument
from .serializers import InspectionSerializer, COADocumentSerializer

class InspectionViewSet(viewsets.ModelViewSet):
    serializer_class = InspectionSerializer
    filterset_fields = ['shipment', 'inspection_type', 'status']
    def get_queryset(self):
        return Inspection.objects.prefetch_related('media').all()

class COADocumentViewSet(viewsets.ModelViewSet):
    queryset = COADocument.objects.all()
    serializer_class = COADocumentSerializer
    filterset_fields = ['shipment', 'product', 'coa_type']
