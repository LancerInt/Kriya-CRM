from rest_framework import serializers
from .models import Product, ProductDocument, CountryCompliance


class ProductDocumentSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True, default='')

    class Meta:
        model = ProductDocument
        fields = ['id', 'product', 'product_name', 'name', 'file', 'doc_type', 'uploaded_at']
        read_only_fields = ['id', 'uploaded_at']

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['id', 'name', 'hsn_code', 'category', 'active_ingredient', 'concentration',
                  'description', 'base_price', 'currency', 'unit', 'client_brand_names',
                  'is_active', 'quality_spec', 'created_at']

    def validate(self, data):
        # Check for exact duplicate — all key fields must match
        check_fields = {}
        key_fields = ['name', 'category', 'active_ingredient', 'concentration', 'base_price', 'currency', 'unit', 'hsn_code']
        for f in key_fields:
            if f in data:
                check_fields[f] = data[f]
            elif self.instance:
                check_fields[f] = getattr(self.instance, f)

        qs = Product.objects.filter(is_deleted=False, **check_fields)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {'error': f'Duplicate product: "{qs.first().name}" with the same name, category, concentration, price and unit already exists. Change at least one detail to add a new product.'}
            )
        return data

class CountryComplianceSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    class Meta:
        model = CountryCompliance
        fields = ['id', 'product', 'product_name', 'country', 'is_allowed', 'notes']
