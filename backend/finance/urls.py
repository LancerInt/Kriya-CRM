from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import dashboard_views

router = DefaultRouter()
router.register('invoices', views.InvoiceViewSet, basename='invoice')
router.register('payments', views.PaymentViewSet, basename='payment')
router.register('firc', views.FIRCRecordViewSet, basename='firc')
router.register('gst', views.GSTRecordViewSet, basename='gst')
router.register('pi', views.ProformaInvoiceViewSet, basename='proforma-invoice')
router.register('ci', views.CommercialInvoiceViewSet, basename='commercial-invoice')
router.register('li', views.LogisticsInvoiceViewSet, basename='logistics-invoice')
router.register('pif', views.PackingInstructionFormViewSet, basename='packing-instruction-form')
router.register('packing-list', views.PackingListViewSet, basename='packing-list')
router.register('compliance', views.ComplianceDocumentViewSet, basename='compliance-document')

urlpatterns = [
    # Dashboard analytics endpoints (must come before the router include
    # so the router doesn't intercept them)
    path('summary/', dashboard_views.finance_summary, name='finance-summary'),
    path('revenue-by-client/', dashboard_views.revenue_by_client, name='finance-revenue-by-client'),
    path('aging/', dashboard_views.aging_analysis, name='finance-aging'),
    path('revenue-trend/', dashboard_views.revenue_trend, name='finance-revenue-trend'),
    path('revenue-by-country/', dashboard_views.revenue_by_country, name='finance-revenue-by-country'),
    path('product-revenue/', dashboard_views.product_revenue, name='finance-product-revenue'),
    path('recent-payments/', dashboard_views.recent_payments, name='finance-recent-payments'),
    path('recent-invoices/', dashboard_views.recent_invoices, name='finance-recent-invoices'),
    path('payment-status/', dashboard_views.payment_status_breakdown, name='finance-payment-status'),
    path('client/<uuid:client_id>/financial-details/',
         dashboard_views.client_financial_details, name='finance-client-details'),
    path('', include(router.urls)),
]
