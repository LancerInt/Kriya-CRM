from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.http import JsonResponse


def healthcheck(_request):
    """Render pings this to confirm the service is alive (200 = healthy)."""
    return JsonResponse({'status': 'ok'})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('healthz/', healthcheck, name='healthz'),
    path('api/auth/', include('accounts.urls')),
    path('api/clients/', include('clients.urls')),
    path('api/communications/', include('communications.urls')),
    path('api/tasks/', include('tasks.urls')),
    path('api/products/', include('products.urls')),
    path('api/quotations/', include('quotations.urls')),
    path('api/orders/', include('orders.urls')),
    path('api/shipments/', include('shipments.urls')),
    path('api/quality/', include('quality.urls')),
    path('api/samples/', include('samples.urls')),
    path('api/finance/', include('finance.urls')),
    path('api/documents/', include('documents.urls')),
    path('api/analytics/', include('analytics.urls')),
    path('api/meetings/', include('meetings.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/agents/', include('agents.urls')),
    path('api/chat/', include('teamchat.urls')),
    path('api/recycle-bin/', include('common.recycle_urls')),
]

# Serve uploaded media. In DEBUG this is Django's dev helper; in production
# (Render free tier, no S3) we fall back to django.views.static — fine until
# you wire object storage. Replace with a CDN/S3 backend when you can.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
