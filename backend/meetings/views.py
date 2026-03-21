from rest_framework import viewsets
from .models import CallLog
from .serializers import CallLogSerializer

class CallLogViewSet(viewsets.ModelViewSet):
    serializer_class = CallLogSerializer
    filterset_fields = ['client', 'user', 'status']
    def get_queryset(self):
        return CallLog.objects.select_related('client', 'user', 'contact').all()
