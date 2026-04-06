from rest_framework import serializers
from .models import Document, Folder


class FolderSerializer(serializers.ModelSerializer):
    file_count = serializers.SerializerMethodField()
    subfolder_count = serializers.SerializerMethodField()

    class Meta:
        model = Folder
        fields = ['id', 'name', 'parent', 'created_by', 'file_count', 'subfolder_count', 'created_at']
        read_only_fields = ['id', 'created_by']

    def get_file_count(self, obj):
        return obj.documents.count()

    def get_subfolder_count(self, obj):
        return obj.children.count()

    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class DocumentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True, default='')
    folder_name = serializers.CharField(source='folder.name', read_only=True, default='')
    class Meta:
        model = Document
        fields = '__all__'
        read_only_fields = ['id', 'uploaded_by']
    def create(self, validated_data):
        validated_data['uploaded_by'] = self.context['request'].user
        return super().create(validated_data)
