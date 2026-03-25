from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Sample, SampleFeedback
from .serializers import SampleSerializer, SampleFeedbackSerializer

class SampleViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = SampleSerializer
    filterset_fields = ['client', 'status']
    search_fields = ['product_name', 'tracking_number']
    def get_queryset(self):
        return Sample.objects.select_related('client', 'product', 'created_by').all()

    @action(detail=True, methods=['post'])
    def add_feedback(self, request, pk=None):
        sample = self.get_object()
        serializer = SampleFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(sample=sample)
        sample.status = 'feedback_received'
        sample.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
