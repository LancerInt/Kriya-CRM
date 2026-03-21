from rest_framework import serializers
from .models import Inspection, InspectionMedia, COADocument

class InspectionMediaSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionMedia
        fields = ['id', 'file', 'media_type', 'uploaded_at']

class InspectionSerializer(serializers.ModelSerializer):
    media = InspectionMediaSerializer(many=True, read_only=True)
    class Meta:
        model = Inspection
        fields = '__all__'
        read_only_fields = ['id']

class COADocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = COADocument
        fields = '__all__'
        read_only_fields = ['id']
