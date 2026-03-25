from common.models import SoftDeleteViewMixin
from rest_framework import viewsets
from .models import Document
from .serializers import DocumentSerializer

class DocumentViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    filterset_fields = ['client', 'order', 'shipment', 'category']
    search_fields = ['name', 'filename']
    def get_queryset(self):
        return Document.objects.select_related('uploaded_by').all()
