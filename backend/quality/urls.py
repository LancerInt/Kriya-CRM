from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('inspections', views.InspectionViewSet, basename='inspection')
router.register('coa', views.COADocumentViewSet, basename='coa')
router.register('msds', views.MSDSDocumentViewSet, basename='msds')
urlpatterns = [
    path('coa-next-report-number/', views.coa_next_report_number, name='coa-next-report-number'),
    path('coa-consume-report-number/', views.coa_consume_report_number, name='coa-consume-report-number'),
    path('', include(router.urls)),
]
