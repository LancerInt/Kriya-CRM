from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import ChatRoom, ChatMessage
from .serializers import ChatRoomSerializer, ChatMessageSerializer


class ChatRoomViewSet(viewsets.ModelViewSet):
    serializer_class = ChatRoomSerializer

    def get_queryset(self):
        return ChatRoom.objects.prefetch_related('messages').all()

    @action(detail=True, methods=['get'])
    def messages(self, request, pk=None):
        room = self.get_object()
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
        return Response(ChatMessageSerializer(msg).data, status=status.HTTP_201_CREATED)


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
