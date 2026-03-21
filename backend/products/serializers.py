from rest_framework import serializers
from .models import Product, CountryCompliance

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'name', 'category', 'active_ingredient', 'concentration',
                  'description', 'base_price', 'currency', 'is_active', 'created_at']

class CountryComplianceSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    class Meta:
        model = CountryCompliance
        fields = ['id', 'product', 'product_name', 'country', 'is_allowed', 'notes']
