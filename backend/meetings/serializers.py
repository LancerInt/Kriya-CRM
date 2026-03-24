from rest_framework import serializers
from .models import CallLog, MeetingPlatformConfig
from common.encryption import encrypt_value


class CallLogSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    user_name = serializers.CharField(source='user.full_name', read_only=True, default='')

    class Meta:
        model = CallLog
        fields = '__all__'
        read_only_fields = ['id', 'user']

    def create(self, validated_data):
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)


class MeetingPlatformConfigSerializer(serializers.ModelSerializer):
    is_connected = serializers.SerializerMethodField()

    class Meta:
        model = MeetingPlatformConfig
        fields = ['id', 'platform', 'is_active',
                  'zoom_account_id', 'zoom_client_id', 'zoom_client_secret',
                  'google_client_id', 'google_client_secret', 'google_calendar_id',
                  'google_user_email', 'is_connected',
                  'teams_tenant_id', 'teams_client_id', 'teams_client_secret',
                  'created_at', 'updated_at']
        read_only_fields = ['id', 'google_user_email', 'created_at', 'updated_at']
        extra_kwargs = {
            'zoom_client_secret': {'write_only': True},
            'google_client_secret': {'write_only': True},
            'teams_client_secret': {'write_only': True},
        }

    def get_is_connected(self, obj):
        if obj.platform == 'google':
            return bool(obj.google_refresh_token)
        if obj.platform == 'zoom':
            return bool(obj.zoom_client_id and obj.zoom_client_secret)
        return False

    def create(self, validated_data):
        secrets = {}
        for field in ['zoom_client_secret', 'google_client_secret', 'teams_client_secret']:
            raw = validated_data.pop(field, '')
            if raw:
                secrets[field] = raw

        instance = super().create(validated_data)
        for field, raw in secrets.items():
            instance.set_secret(field, raw)
        if secrets:
            instance.save(update_fields=list(secrets.keys()))
        return instance

    def update(self, instance, validated_data):
        for field in ['zoom_client_secret', 'google_client_secret', 'teams_client_secret']:
            raw = validated_data.pop(field, None)
            if raw:
                instance.set_secret(field, raw)
                instance.save(update_fields=[field])
        return super().update(instance, validated_data)
