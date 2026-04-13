from common.models import SoftDeleteViewMixin
from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Document, Folder
from .serializers import DocumentSerializer, FolderSerializer


# ── Visibility helpers ────────────────────────────────────────────────────
#
# Visibility rules (apply to BOTH Folder and Document):
#
#   public  → visible to everyone (executive, manager, admin)
#   private → visible only to:
#             • the creator (uploader for Document, created_by for Folder)
#             • all admin and manager users
#
# So an EXECUTIVE creating a private file: only that exec + admins/managers see it.
# An ADMIN/MANAGER creating a private file: only admins/managers see it (the
# creator's executive teammates do NOT see it because they're not admin/manager
# and they're not the creator).
#
# Toggling between public/private is done via the dedicated `set-visibility`
# action on each viewset.

def _scope_folders(user):
    qs = Folder.objects.filter(is_deleted=False)
    if user.role in ('admin', 'manager'):
        return qs  # admin/manager see everything
    # Executive: see public + their own private folders
    return qs.filter(Q(visibility='public') | Q(created_by=user))


def _scope_documents(user):
    qs = Document.objects.filter(is_deleted=False).select_related('uploaded_by', 'folder')
    if user.role in ('admin', 'manager'):
        return qs
    return qs.filter(Q(visibility='public') | Q(uploaded_by=user))


class FolderViewSet(viewsets.ModelViewSet):
    serializer_class = FolderSerializer
    filterset_fields = ['parent', 'visibility']

    def get_queryset(self):
        return _scope_folders(self.request.user)

    @action(detail=True, methods=['get'])
    def contents(self, request, pk=None):
        """Get folder contents — subfolders + files (role-filtered)."""
        folder = self.get_object()
        children = _scope_folders(request.user).filter(parent=folder)
        files = _scope_documents(request.user).filter(folder=folder)
        return Response({
            'folders': FolderSerializer(children, many=True).data,
            'files': DocumentSerializer(files, many=True).data,
            'folder': FolderSerializer(folder).data,
        })

    @action(detail=True, methods=['post'], url_path='set-visibility')
    def set_visibility(self, request, pk=None):
        """Toggle a folder between public and private.

        Only the creator of the folder OR admin/manager can change its
        visibility. Other users get a 403.
        """
        folder = self.get_object()
        if not (request.user.role in ('admin', 'manager') or folder.created_by_id == request.user.id):
            return Response({'error': 'You cannot change the visibility of this folder'},
                            status=status.HTTP_403_FORBIDDEN)
        new_value = (request.data.get('visibility') or '').lower()
        if new_value not in ('public', 'private'):
            return Response({'error': 'visibility must be "public" or "private"'},
                            status=status.HTTP_400_BAD_REQUEST)
        folder.visibility = new_value
        folder.save(update_fields=['visibility'])
        return Response(FolderSerializer(folder).data)


class DocumentViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    filterset_fields = ['client', 'order', 'shipment', 'category', 'folder', 'visibility']
    search_fields = ['name', 'filename']

    def get_queryset(self):
        return _scope_documents(self.request.user)

    @action(detail=True, methods=['post'], url_path='set-visibility')
    def set_visibility(self, request, pk=None):
        """Toggle a document between public and private.

        Only the uploader OR admin/manager can change visibility.
        """
        document = self.get_object()
        if not (request.user.role in ('admin', 'manager') or document.uploaded_by_id == request.user.id):
            return Response({'error': 'You cannot change the visibility of this document'},
                            status=status.HTTP_403_FORBIDDEN)
        new_value = (request.data.get('visibility') or '').lower()
        if new_value not in ('public', 'private'):
            return Response({'error': 'visibility must be "public" or "private"'},
                            status=status.HTTP_400_BAD_REQUEST)
        document.visibility = new_value
        document.save(update_fields=['visibility'])
        return Response(DocumentSerializer(document).data)
