from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('inquiries', views.InquiryViewSet, basename='inquiry')
router.register('', views.QuotationViewSet, basename='quotation')
urlpatterns = [path('', include(router.urls))]
