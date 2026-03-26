from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('invoices', views.InvoiceViewSet, basename='invoice')
router.register('payments', views.PaymentViewSet, basename='payment')
router.register('firc', views.FIRCRecordViewSet, basename='firc')
router.register('gst', views.GSTRecordViewSet, basename='gst')
router.register('pi', views.ProformaInvoiceViewSet, basename='proforma-invoice')
urlpatterns = [path('', include(router.urls))]
