from rest_framework import viewsets
from .models import Communication
from .serializers import CommunicationSerializer


class CommunicationViewSet(viewsets.ModelViewSet):
    serializer_class = CommunicationSerializer
    filterset_fields = ['client', 'comm_type', 'direction', 'is_follow_up_required']
    search_fields = ['subject', 'body']
    ordering_fields = ['created_at']

    def get_queryset(self):
        return Communication.objects.select_related('user', 'contact', 'client').prefetch_related('attachments').all()

    def perform_create(self, serializer):
        comm = serializer.save(user=self.request.user)
        # Update client's updated_at
        comm.client.save(update_fields=['updated_at'])
