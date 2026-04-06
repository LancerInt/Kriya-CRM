from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q, Count
from .models import Task
from .serializers import TaskSerializer


from notifications.helpers import notify


class TaskViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    filterset_fields = ['status', 'priority', 'client', 'owner']
    search_fields = ['title', 'description']
    ordering_fields = ['due_date', 'priority', 'created_at']

    def get_queryset(self):
        qs = Task.objects.filter(is_deleted=False).select_related('owner', 'client', 'created_by')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(Q(owner=user) | Q(created_by=user) | Q(client__in=client_ids))
        return qs

    def perform_create(self, serializer):
        task = serializer.save()
        extra = [task.owner] if task.owner else []
        notify(
            title=f'New task: {task.title}',
            message=f'{self.request.user.full_name} created a task{" for " + task.client.company_name if task.client else ""}.',
            notification_type='task', link='/tasks',
            actor=self.request.user, client=task.client, extra_users=extra,
        )

    @action(detail=False, methods=['get'])
    def stats(self, request):
        qs = self.get_queryset()
        now = timezone.now()
        return Response({
            'total': qs.count(),
            'pending': qs.filter(status='pending').count(),
            'in_progress': qs.filter(status='in_progress').count(),
            'completed': qs.filter(status='completed').count(),
            'overdue': qs.filter(status__in=['pending', 'in_progress'], due_date__lt=now).count(),
        })

    @action(detail=True, methods=['post'], url_path='update-status')
    def update_status(self, request, pk=None):
        """Update task status with optional custom note."""
        task = self.get_object()
        new_status = request.data.get('status', '').strip()
        status_note = request.data.get('status_note', '').strip()

        valid_statuses = ['pending', 'in_progress', 'completed', 'cancelled']
        if new_status and new_status not in valid_statuses:
            from rest_framework import status as http_status
            return Response({'error': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'}, status=http_status.HTTP_400_BAD_REQUEST)

        if new_status:
            task.status = new_status
            if new_status == 'completed':
                task.completed_at = timezone.now()
        if status_note:
            task.status_note = status_note
        task.save()

        extra = [task.created_by] if task.created_by else []
        if task.owner:
            extra.append(task.owner)
        notify(
            title=f'Task updated: {task.title}',
            message=f'{request.user.full_name} updated status to "{new_status or task.status}"{" — " + status_note if status_note else ""}.',
            notification_type='task', link='/tasks',
            actor=request.user, client=task.client, extra_users=extra,
        )
        return Response(TaskSerializer(task).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        task.status = 'completed'
        task.completed_at = timezone.now()
        task.save()

        extra = [task.created_by] if task.created_by else []
        if task.owner:
            extra.append(task.owner)
        notify(
            title=f'Task completed: {task.title}',
            message=f'{request.user.full_name} completed "{task.title}"{" for " + task.client.company_name if task.client else ""}.',
            notification_type='task', link='/tasks',
            actor=request.user, client=task.client, extra_users=extra,
        )

        return Response(TaskSerializer(task).data)
