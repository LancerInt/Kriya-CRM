from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('platform-configs', views.MeetingPlatformConfigViewSet, basename='platform-config')
router.register('', views.CallLogViewSet, basename='calllog')

urlpatterns = [
    path('google-oauth-callback/', views.google_oauth_callback, name='google-oauth-callback'),
    path('', include(router.urls)),
]
