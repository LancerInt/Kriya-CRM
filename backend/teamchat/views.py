from django.db.models import Q
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import ChatRoom, ChatMessage
from .serializers import ChatRoomSerializer, ChatMessageSerializer


class ChatRoomViewSet(viewsets.ModelViewSet):
    serializer_class = ChatRoomSerializer

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def get_queryset(self):
        user = self.request.user
        # Non-direct rooms: visible to everyone
        # Direct rooms: only visible to members
        return ChatRoom.objects.prefetch_related('messages', 'members').filter(
            Q(is_direct=False) | Q(members=user)
        ).distinct()

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        room = self.get_object()
        # For direct rooms, only members can read
        if room.is_direct and not room.members.filter(id=request.user.id).exists():
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        since = request.query_params.get('since')
        qs = room.messages.select_related('user').all()
        if since:
            from django.utils.dateparse import parse_datetime
            dt = parse_datetime(since)
            if dt:
                qs = qs.filter(created_at__gt=dt)
        else:
            qs = qs.order_by('-created_at')[:50]
            qs = list(qs)
            qs.reverse()
        return Response(ChatMessageSerializer(qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='send')
    def send_message(self, request, pk=None):
        room = self.get_object()
        # For direct rooms, only members can send
        if room.is_direct and not room.members.filter(id=request.user.id).exists():
            return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
        msg_type = request.data.get('message_type', 'text')
        content = request.data.get('content', '')
        file = request.FILES.get('file')

        msg = ChatMessage.objects.create(
            room=room,
            user=request.user,
            message_type=msg_type,
            content=content,
            file=file,
            filename=file.name if file else '',
        )

        # Notify DM recipient
        if room.is_direct:
            from notifications.models import Notification
            for member in room.members.exclude(id=request.user.id):
                Notification.objects.create(
                    user=member,
                    notification_type='system',
                    title=f'New message from {request.user.full_name}',
                    message=content[:100] if msg_type == 'text' else f'{request.user.full_name} sent a {msg_type}',
                    link='/team-chat',
                )

        return Response(ChatMessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='direct')
    def get_or_create_direct(self, request):
        """Get or create a private DM conversation between current user and another user."""
        other_user_id = request.data.get('user_id')
        if not other_user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        from accounts.models import User
        try:
            other_user = User.objects.get(id=other_user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if other_user == request.user:
            return Response({'error': 'Cannot DM yourself'}, status=status.HTTP_400_BAD_REQUEST)

        # Find existing DM room between exactly these two users
        existing = ChatRoom.objects.filter(
            is_direct=True, members=request.user
        ).filter(members=other_user)

        if existing.exists():
            room = existing.first()
        else:
            room = ChatRoom.objects.create(
                name=f'dm_{min(str(request.user.id), str(other_user.id))}_{max(str(request.user.id), str(other_user.id))}',
                is_direct=True,
            )
            room.members.add(request.user, other_user)

        return Response(ChatRoomSerializer(room, context={'request': request}).data)

    @action(detail=False, methods=['get'], url_path='users')
    def list_users(self, request):
        """List all active users except self, for DM selection."""
        from accounts.models import User
        qs = User.objects.filter(is_active=True).exclude(id=request.user.id).order_by('first_name', 'last_name')
        data = [{'id': str(u.id), 'full_name': u.full_name, 'role': u.role} for u in qs]
        return Response(data)


class ChatMessageViewSet(viewsets.ModelViewSet):
    serializer_class = ChatMessageSerializer

    def get_queryset(self):
        return ChatMessage.objects.select_related('user').all()

    def update(self, request, *args, **kwargs):
        msg = self.get_object()
        if msg.user != request.user:
            return Response({'error': 'You can only edit your own messages'}, status=status.HTTP_403_FORBIDDEN)
        msg.content = request.data.get('content', msg.content)
        msg.is_edited = True
        msg.save(update_fields=['content', 'is_edited'])
        return Response(ChatMessageSerializer(msg).data)

    def destroy(self, request, *args, **kwargs):
        msg = self.get_object()
        if msg.user != request.user and request.user.role not in ('admin', 'manager'):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        msg.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
