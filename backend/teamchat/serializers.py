from rest_framework import serializers
from .models import ChatRoom, ChatMessage


class ChatMessageSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    user_role = serializers.CharField(source='user.role', read_only=True)

    class Meta:
        model = ChatMessage
        fields = ['id', 'room', 'user', 'user_name', 'user_role', 'message_type',
                  'content', 'file', 'filename', 'is_edited', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']


class ChatRoomSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    message_count = serializers.IntegerField(source='messages.count', read_only=True)

    class Meta:
        model = ChatRoom
        fields = ['id', 'name', 'description', 'is_general', 'last_message', 'message_count', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_last_message(self, obj):
        msg = obj.messages.order_by('-created_at').first()
        if msg:
            return {'user_name': msg.user.full_name, 'content': msg.content[:80], 'created_at': msg.created_at.isoformat()}
        return None
