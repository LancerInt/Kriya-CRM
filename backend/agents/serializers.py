from rest_framework import serializers
from .models import AIConfig, AgentConversation, AgentMessage
from common.encryption import encrypt_value


class AIConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = AIConfig
        fields = ['id', 'provider', 'model_name', 'api_key', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']
        extra_kwargs = {'api_key': {'write_only': True}}

    def create(self, validated_data):
        raw_key = validated_data.pop('api_key', '')
        instance = super().create(validated_data)
        if raw_key:
            instance.api_key = encrypt_value(raw_key)
            instance.save(update_fields=['api_key'])
        return instance

    def update(self, instance, validated_data):
        raw_key = validated_data.pop('api_key', None)
        instance = super().update(instance, validated_data)
        if raw_key:
            instance.api_key = encrypt_value(raw_key)
            instance.save(update_fields=['api_key'])
        return instance


class AgentMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentMessage
        fields = ['id', 'role', 'content', 'tool_calls', 'tokens_used', 'created_at']
        read_only_fields = ['id', 'created_at']


class AgentConversationSerializer(serializers.ModelSerializer):
    messages = AgentMessageSerializer(many=True, read_only=True)
    message_count = serializers.IntegerField(source='messages.count', read_only=True)

    class Meta:
        model = AgentConversation
        fields = ['id', 'title', 'message_count', 'messages', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class AgentConversationListSerializer(serializers.ModelSerializer):
    message_count = serializers.IntegerField(source='messages.count', read_only=True)

    class Meta:
        model = AgentConversation
        fields = ['id', 'title', 'message_count', 'created_at', 'updated_at']
