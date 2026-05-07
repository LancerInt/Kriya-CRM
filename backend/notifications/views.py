from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Notification
from .serializers import NotificationSerializer

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        # Piggyback periodic order reminders here so they still fire when
        # Celery Beat isn't running in dev. Throttled to once per minute via
        # the cache so the count endpoint stays cheap.
        try:
            from django.core.cache import cache
            if cache.add('order-reminder-tick', '1', timeout=60):
                from orders.tasks import (
                    check_delivery_reminders, check_cro_reminders,
                    check_transit_doc_reminders, check_balance_payment_reminders,
                    check_overdue_payment_reminders,
                )
                try:
                    check_delivery_reminders()
                except Exception:
                    pass
                try:
                    check_cro_reminders()
                except Exception:
                    pass
                try:
                    check_transit_doc_reminders()
                except Exception:
                    pass
                try:
                    check_balance_payment_reminders()
                except Exception:
                    pass
                try:
                    check_overdue_payment_reminders()
                except Exception:
                    pass
        except Exception:
            pass
        count = self.get_queryset().filter(is_read=False).count()
        return Response({'count': count})

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({'status': 'ok'})

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        n = self.get_object()
        n.is_read = True
        n.save()
        return Response(NotificationSerializer(n).data)

    @action(detail=False, methods=['post'])
    def broadcast(self, request):
        """Send a notification to all users (for call alerts, announcements)."""
        from accounts.models import User
        title = request.data.get('title', '')
        message = request.data.get('message', '')
        notification_type = request.data.get('notification_type', 'system')
        link = request.data.get('link', '')

        users = User.objects.filter(is_active=True).exclude(id=request.user.id)
        notifications = [
            Notification(user=u, title=title, message=message, notification_type=notification_type, link=link)
            for u in users
        ]
        Notification.objects.bulk_create(notifications)
        return Response({'status': f'Sent to {len(notifications)} users'})
