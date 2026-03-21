from rest_framework import viewsets
from .models import Product, CountryCompliance
from .serializers import ProductSerializer, CountryComplianceSerializer

class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    filterset_fields = ['category', 'is_active']
    search_fields = ['name', 'active_ingredient', 'category']
    def get_queryset(self):
        return Product.objects.filter(is_deleted=False)
    def perform_destroy(self, instance):
        instance.soft_delete()

class CountryComplianceViewSet(viewsets.ModelViewSet):
    queryset = CountryCompliance.objects.select_related('product').all()
    serializer_class = CountryComplianceSerializer
    filterset_fields = ['product', 'country', 'is_allowed']
