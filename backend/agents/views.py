import logging
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from .models import AIConfig, AgentConversation, AgentMessage
from .serializers import (AIConfigSerializer, AgentConversationSerializer,
                          AgentConversationListSerializer)

logger = logging.getLogger(__name__)


class AIConfigViewSet(viewsets.ModelViewSet):
    serializer_class = AIConfigSerializer
    def get_queryset(self):
        return AIConfig.objects.all()


class AgentConversationViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        return AgentConversation.objects.filter(user=self.request.user).prefetch_related('messages')

    def get_serializer_class(self):
        if self.action == 'list':
            return AgentConversationListSerializer
        return AgentConversationSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def chat(self, request, pk=None):
        """Send a message and get AI response."""
        conversation = self.get_object()
        user_message = request.data.get('message', '').strip()

        if not user_message:
            return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)

        config = AIConfig.objects.filter(is_active=True).first()
        if not config:
            return Response(
                {'error': 'No AI provider configured. Go to Settings > AI Config to add your API key.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        AgentMessage.objects.create(conversation=conversation, role='user', content=user_message)

        history = [{'role': m.role, 'content': m.content}
                    for m in conversation.messages.all().order_by('created_at')]

        from .ai_service import chat_with_agent
        try:
            result = chat_with_agent(history, request.user, config)
        except Exception as e:
            logger.error(f'AI chat error: {e}')
            return Response({'error': f'AI error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        assistant_msg = AgentMessage.objects.create(
            conversation=conversation, role='assistant',
            content=result['content'], tool_calls=result.get('tool_calls', []),
            tokens_used=result.get('tokens_used', 0),
        )

        if conversation.title == 'New Chat':
            conversation.title = user_message[:80]
            conversation.save(update_fields=['title'])

        return Response({
            'message': {
                'id': str(assistant_msg.id), 'role': 'assistant',
                'content': result['content'], 'tool_calls': result.get('tool_calls', []),
                'created_at': assistant_msg.created_at.isoformat(),
            }
        })


@api_view(['POST'])
def quick_chat(request):
    """One-shot chat without conversation history."""
    message = request.data.get('message', '').strip()
    if not message:
        return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)

    config = AIConfig.objects.filter(is_active=True).first()
    if not config:
        return Response({'error': 'No AI configured. Go to Settings > AI Config.'}, status=status.HTTP_400_BAD_REQUEST)

    from .ai_service import chat_with_agent
    try:
        result = chat_with_agent([{'role': 'user', 'content': message}], request.user, config)
        return Response({'content': result['content'], 'tool_calls': result.get('tool_calls', [])})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
