from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('email-accounts', views.EmailAccountViewSet, basename='email-account')
router.register('drafts', views.EmailDraftViewSet, basename='email-draft')
router.register('whatsapp-configs', views.WhatsAppConfigViewSet, basename='whatsapp-config')
router.register('quote-requests', views.QuoteRequestViewSet, basename='quote-request')
router.register('', views.CommunicationViewSet, basename='communication')

urlpatterns = [
    path('send-email/', views.send_email_view, name='send-email'),
    path('send-whatsapp/', views.send_whatsapp_view, name='send-whatsapp'),
    path('summarize-voice/', views.summarize_voice_text, name='summarize-voice'),
    path('refine-email/', views.refine_email_text, name='refine-email'),
    path('whatsapp-webhook/', views.whatsapp_webhook_view, name='whatsapp-webhook'),
    path('signature-logo.png', views.signature_logo_view, name='signature-logo'),
    path('grammar-check/', views.grammar_check_view, name='grammar-check'),
    path('generate-coa-pdf/', views.generate_coa_pdf_view, name='generate-coa-pdf'),
    path('', include(router.urls)),
]
