from django.db import models
from common.models import TimeStampedModel


class AIConfig(TimeStampedModel):
    """Stores AI provider configuration."""
    class Provider(models.TextChoices):
        GROQ = 'groq', 'Groq (Free - Llama)'
        GEMINI = 'gemini', 'Google Gemini (Free)'
        CLAUDE = 'claude', 'Claude (Anthropic)'
        OPENAI = 'openai', 'OpenAI GPT'

    provider = models.CharField(max_length=20, choices=Provider.choices, default=Provider.GEMINI)
    api_key = models.TextField()  # encrypted
    model_name = models.CharField(max_length=100, default='gemini-2.0-flash')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'ai_configs'

    def __str__(self):
        return f"{self.get_provider_display()} - {self.model_name}"


class AgentConversation(TimeStampedModel):
    """Stores chat conversations with AI agents."""
    user = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='agent_conversations')
    title = models.CharField(max_length=255, default='New Chat')

    class Meta:
        db_table = 'agent_conversations'
        ordering = ['-updated_at']


class AgentMessage(TimeStampedModel):
    """Individual messages in an agent conversation."""
    class Role(models.TextChoices):
        USER = 'user', 'User'
        ASSISTANT = 'assistant', 'Assistant'

    conversation = models.ForeignKey(AgentConversation, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=10, choices=Role.choices)
    content = models.TextField()
    tool_calls = models.JSONField(default=list, blank=True)
    tokens_used = models.IntegerField(default=0)

    class Meta:
        db_table = 'agent_messages'
        ordering = ['created_at']
