from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('configs', views.AIConfigViewSet, basename='ai-config')
router.register('conversations', views.AgentConversationViewSet, basename='conversation')

urlpatterns = [
    path('quick-chat/', views.quick_chat, name='quick-chat'),
    path('', include(router.urls)),
]
