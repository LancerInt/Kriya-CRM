from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q, Count
from .models import Task
from .serializers import TaskSerializer


class TaskViewSet(viewsets.ModelViewSet):
    serializer_class = TaskSerializer
    filterset_fields = ['status', 'priority', 'client', 'owner']
    search_fields = ['title', 'description']
    ordering_fields = ['due_date', 'priority', 'created_at']

    def get_queryset(self):
        qs = Task.objects.select_related('owner', 'client', 'created_by').all()
        user = self.request.user
        if user.role == 'executive':
            qs = qs.filter(Q(owner=user) | Q(created_by=user))
        return qs

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

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        task = self.get_object()
        task.status = 'completed'
        task.completed_at = timezone.now()
        task.save()

        # Notify the task creator that it's completed
        from notifications.models import Notification
        if task.created_by and task.created_by != request.user:
            Notification.objects.create(
                user=task.created_by,
                notification_type='task',
                title='Task Completed',
                message=f'"{task.title}" has been completed by {request.user.full_name}.',
                link=f'/tasks',
            )
        # Also notify the main executive of the client
        if task.client and task.client.primary_executive and task.client.primary_executive != request.user:
            Notification.objects.create(
                user=task.client.primary_executive,
                notification_type='task',
                title='Task Completed',
                message=f'"{task.title}" for {task.client.company_name} has been completed by {request.user.full_name}.',
                link=f'/clients/{task.client.id}',
            )

        return Response(TaskSerializer(task).data)
