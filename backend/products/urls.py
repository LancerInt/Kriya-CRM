from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('documents', views.ProductDocumentViewSet, basename='product-document')
router.register('compliance', views.CountryComplianceViewSet, basename='compliance')
router.register('', views.ProductViewSet, basename='product')
urlpatterns = [
    path('search-documents/', views.search_product_documents, name='search-product-documents'),
    path('', include(router.urls)),
]
