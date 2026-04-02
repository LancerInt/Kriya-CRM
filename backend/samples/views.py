from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Sample, SampleFeedback
from .serializers import SampleSerializer, SampleFeedbackSerializer
from notifications.helpers import notify


class SampleViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = SampleSerializer
    filterset_fields = ['client', 'status']
    search_fields = ['product_name', 'tracking_number']
    def get_queryset(self):
        return Sample.objects.select_related('client', 'product', 'created_by').all()

    def perform_create(self, serializer):
        sample = serializer.save(created_by=self.request.user)
        notify(
            title=f'Sample created: {sample.product_name}',
            message=f'{self.request.user.full_name} created sample for {sample.client.company_name}.',
            notification_type='system', link='/samples',
            actor=self.request.user, client=sample.client,
        )

    def perform_update(self, serializer):
        sample = serializer.save()
        notify(
            title=f'Sample updated: {sample.product_name}',
            message=f'{self.request.user.full_name} updated sample status to {sample.status.replace("_", " ")}.',
            notification_type='system', link='/samples',
            actor=self.request.user, client=sample.client,
        )

    @action(detail=True, methods=['post'])
    def add_feedback(self, request, pk=None):
        sample = self.get_object()
        serializer = SampleFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(sample=sample)
        sample.status = 'feedback_received'
        sample.save()
        notify(
            title=f'Sample feedback received: {sample.product_name}',
            message=f'Feedback received for sample sent to {sample.client.company_name}.',
            notification_type='alert', link='/samples',
            actor=request.user, client=sample.client,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)
