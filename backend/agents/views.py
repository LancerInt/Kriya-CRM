import json
import re
import logging
from django.http import StreamingHttpResponse
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
    def stream(self, request, pk=None):
        """
        SSE streaming endpoint — DRF handles authentication automatically.
        Returns text/event-stream with chunks as they arrive from the LLM.
        """
        conversation = self.get_object()
        user_message = request.data.get('message', '').strip()

        if not user_message:
            return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)

        config = AIConfig.objects.filter(is_active=True).first()
        if not config:
            return Response(
                {'error': 'No AI provider configured. Go to Settings > AI Config.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Save user message and build history before streaming starts
        AgentMessage.objects.create(conversation=conversation, role='user', content=user_message)
        history = [
            {'role': m.role, 'content': m.content}
            for m in conversation.messages.all().order_by('created_at')
        ]

        user = request.user
        conv_id = conversation.id
        conv_title = conversation.title

        def generate():
            from .ai_service import stream_chat_with_agent
            full_content = ''
            tool_calls = []

            try:
                for event in stream_chat_with_agent(history, user, config):
                    if event['type'] == 'chunk':
                        full_content += event['content']
                        yield f"data: {json.dumps({'type': 'chunk', 'content': event['content']})}\n\n"
                    elif event['type'] == 'tool_calls':
                        tool_calls = event.get('data', [])
                    elif event['type'] == 'error':
                        yield f"data: {json.dumps({'type': 'error', 'content': event['content']})}\n\n"
                        return
            except Exception as e:
                logger.error(f'Stream error: {e}', exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'content': 'AI service error. Please try again.'})}\n\n"
                return

            # Strip any leftover tool blocks
            clean = re.sub(r'```(?:tool|json)?\s*\n.*?\n```', '', full_content, flags=re.DOTALL).strip()

            # Save to DB
            msg = AgentMessage.objects.create(
                conversation_id=conv_id,
                role='assistant',
                content=clean,
                tool_calls=tool_calls,
            )
            if conv_title == 'New Chat':
                AgentConversation.objects.filter(id=conv_id).update(title=user_message[:80])

            yield f"data: {json.dumps({'type': 'done', 'id': str(msg.id), 'created_at': msg.created_at.isoformat(), 'tool_calls': tool_calls})}\n\n"

        response = StreamingHttpResponse(generate(), content_type='text/event-stream; charset=utf-8')
        response['Cache-Control'] = 'no-cache, no-store'
        response['X-Accel-Buffering'] = 'no'
        response['Connection'] = 'keep-alive'
        return response

    @action(detail=True, methods=['post'])
    def chat(self, request, pk=None):
        """Blocking chat — kept for fallback/quick-chat compatibility."""
        conversation = self.get_object()
        user_message = request.data.get('message', '').strip()
        if not user_message:
            return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)

        config = AIConfig.objects.filter(is_active=True).first()
        if not config:
            return Response({'error': 'No AI provider configured.'}, status=status.HTTP_400_BAD_REQUEST)

        user_msg = AgentMessage.objects.create(conversation=conversation, role='user', content=user_message)
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
            'user_message': {
                'id': str(user_msg.id), 'role': 'user',
                'content': user_message,
                'created_at': user_msg.created_at.isoformat(),
            },
            'message': {
                'id': str(assistant_msg.id), 'role': 'assistant',
                'content': result['content'], 'tool_calls': result.get('tool_calls', []),
                'created_at': assistant_msg.created_at.isoformat(),
            },
        })


@api_view(['DELETE'])
def delete_message(request, pk):
    """Delete a single message (must belong to the requesting user's conversation)."""
    try:
        msg = AgentMessage.objects.select_related('conversation').get(pk=pk)
    except AgentMessage.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
    if msg.conversation.user != request.user:
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
    msg.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
def quick_chat(request):
    """One-shot chat without conversation history."""
    message = request.data.get('message', '').strip()
    if not message:
        return Response({'error': 'Message is required'}, status=status.HTTP_400_BAD_REQUEST)

    config = AIConfig.objects.filter(is_active=True).first()
    if not config:
        return Response({'error': 'No AI configured.'}, status=status.HTTP_400_BAD_REQUEST)

    from .ai_service import chat_with_agent
    try:
        result = chat_with_agent([{'role': 'user', 'content': message}], request.user, config)
        return Response({'content': result['content'], 'tool_calls': result.get('tool_calls', [])})
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
