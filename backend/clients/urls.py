from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('contacts', views.ContactViewSet, basename='contact')
router.register('price-list', views.ClientPriceListViewSet, basename='client-price-list')
router.register('purchase-history', views.PurchaseHistoryViewSet, basename='purchase-history')
router.register('', views.ClientViewSet, basename='client')

urlpatterns = [
    path('', include(router.urls)),
]
