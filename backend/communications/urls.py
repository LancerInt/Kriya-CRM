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
    path('whatsapp-webhook/', views.whatsapp_webhook_view, name='whatsapp-webhook'),
    path('', include(router.urls)),
]
