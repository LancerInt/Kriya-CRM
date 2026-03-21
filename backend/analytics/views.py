from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db.models import Count, Sum, Q
from django.utils import timezone
from clients.models import Client
from orders.models import Order
from tasks.models import Task
from quotations.models import Inquiry, Quotation
from finance.models import Invoice

@api_view(['GET'])
def dashboard_stats(request):
    now = timezone.now()
    stats = {
        'clients': {
            'total': Client.objects.filter(is_deleted=False).count(),
            'active': Client.objects.filter(is_deleted=False, status='active').count(),
        },
        'tasks': {
            'pending': Task.objects.filter(status='pending').count(),
            'overdue': Task.objects.filter(status__in=['pending', 'in_progress'], due_date__lt=now).count(),
        },
        'pipeline': {
            'active_inquiries': Inquiry.objects.exclude(stage__in=['order_confirmed', 'lost']).count(),
            'pending_approvals': Quotation.objects.filter(status='pending_approval').count(),
        },
        'orders': {
            'total': Order.objects.count(),
            'active': Order.objects.filter(status__in=['confirmed', 'processing', 'shipped']).count(),
        },
        'revenue': {
            'total': Order.objects.aggregate(total=Sum('total'))['total'] or 0,
        },
        'pipeline_by_stage': list(
            Inquiry.objects.exclude(stage__in=['order_confirmed', 'lost'])
            .values('stage').annotate(count=Count('id'), value=Sum('expected_value'))
        ),
        'clients_by_country': list(
            Client.objects.filter(is_deleted=False).exclude(country='')
            .values('country').annotate(count=Count('id')).order_by('-count')[:10]
        ),
    }
    return Response(stats)
