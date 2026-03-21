from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('inspections', views.InspectionViewSet, basename='inspection')
router.register('coa', views.COADocumentViewSet, basename='coa')
urlpatterns = [path('', include(router.urls))]
