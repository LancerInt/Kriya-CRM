from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Q, Count
from .models import Task
from .serializers import TaskSerializer
from .notifications import (
    notify_task_assigned,
    notify_task_completed,
    notify_task_due_reminder,
)


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
        # Send the dedicated task assignment notification (in-app + email +
        # stamps assigned_at). Also fires the "first" reminder if a deadline
        # is set so the assignee gets the heads-up immediately, not 24 hours
        # later when the daily Celery tick runs. Wrapped so a notification
        # failure (e.g. SMTP outage) can never break task creation.
        try:
            notify_task_assigned(task, actor=self.request.user, is_reassignment=False)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('notify_task_assigned failed')
        if task.due_date:
            try:
                notify_task_due_reminder(task, kind='first')
            except Exception:
                pass

    def perform_update(self, serializer):
        # Detect owner change BEFORE saving so we know whether to fire a
        # reassignment notification.
        old_owner_id = None
        if serializer.instance and serializer.instance.pk:
            old_owner_id = Task.objects.filter(pk=serializer.instance.pk).values_list('owner_id', flat=True).first()
        task = serializer.save()
        if task.owner_id and task.owner_id != old_owner_id:
            try:
                notify_task_assigned(task, actor=self.request.user, is_reassignment=bool(old_owner_id))
            except Exception:
                import logging
                logging.getLogger(__name__).exception('notify_task_assigned failed')
            if task.due_date:
                try:
                    notify_task_due_reminder(task, kind='first')
                except Exception:
                    pass

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
        old_status = task.status
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

        # If the status flipped to completed, fire the dedicated completion
        # notifier (email + in-app to creator AND owner). Otherwise just send
        # a generic status-update note.
        if new_status == 'completed' and old_status != 'completed':
            notify_task_completed(task, actor=request.user)
        else:
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
        was_completed_already = task.status == 'completed'
        task.status = 'completed'
        task.completed_at = timezone.now()
        task.save()

        if not was_completed_already:
            notify_task_completed(task, actor=request.user)
        return Response(TaskSerializer(task).data)
