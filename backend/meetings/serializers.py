from rest_framework import serializers
from .models import CallLog

class CallLogSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source='client.company_name', read_only=True, default='')
    user_name = serializers.CharField(source='user.full_name', read_only=True, default='')
    class Meta:
        model = CallLog
        fields = '__all__'
        read_only_fields = ['id']
