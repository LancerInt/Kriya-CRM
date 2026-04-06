from common.models import SoftDeleteViewMixin
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Document, Folder
from .serializers import DocumentSerializer, FolderSerializer


class FolderViewSet(viewsets.ModelViewSet):
    serializer_class = FolderSerializer
    filterset_fields = ['parent']

    def get_queryset(self):
        return Folder.objects.all()

    @action(detail=True, methods=['get'])
    def contents(self, request, pk=None):
        """Get folder contents — subfolders + files."""
        folder = self.get_object()
        subfolders = FolderSerializer(folder.children.all(), many=True).data
        files = DocumentSerializer(folder.documents.select_related('uploaded_by').all(), many=True).data
        return Response({'folders': subfolders, 'files': files, 'folder': FolderSerializer(folder).data})


class DocumentViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    filterset_fields = ['client', 'order', 'shipment', 'category', 'folder']
    search_fields = ['name', 'filename']
    def get_queryset(self):
        return Document.objects.select_related('uploaded_by', 'folder').all()
