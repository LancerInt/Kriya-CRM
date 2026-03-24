from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('messages', views.ChatMessageViewSet, basename='chatmessage')
router.register('rooms', views.ChatRoomViewSet, basename='chatroom')

urlpatterns = [path('', include(router.urls))]
