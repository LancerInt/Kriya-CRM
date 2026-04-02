from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db.models import Count, Sum, Q
from django.utils import timezone
from clients.models import Client, ClientAssignment
from orders.models import Order
from tasks.models import Task
from quotations.models import Inquiry, Quotation
from finance.models import Invoice


def _get_exec_client_ids(user):
    """Return queryset of client IDs accessible to an executive."""
    return Client.objects.filter(
        is_deleted=False
    ).filter(
        Q(primary_executive=user) |
        Q(shadow_executive=user) |
        Q(assignments__user=user)
    ).distinct().values_list('id', flat=True)


@api_view(['GET'])
def dashboard_stats(request):
    user = request.user
    now = timezone.now()
    is_executive = user.role == 'executive'

    if is_executive:
        client_ids = _get_exec_client_ids(user)
        client_qs = Client.objects.filter(is_deleted=False, id__in=client_ids)
        task_qs = Task.objects.filter(
            Q(owner=user) | Q(client_id__in=client_ids)
        )
        inquiry_qs = Inquiry.objects.filter(client_id__in=client_ids)
        quotation_qs = Quotation.objects.filter(client_id__in=client_ids)
        order_qs = Order.objects.filter(client_id__in=client_ids)

        # Shadow clients info for the popup
        shadow_clients = list(
            Client.objects.filter(is_deleted=False, shadow_executive=user)
            .values('id', 'company_name', 'status', 'country')
        )
    else:
        client_qs = Client.objects.filter(is_deleted=False)
        task_qs = Task.objects.all()
        inquiry_qs = Inquiry.objects.all()
        quotation_qs = Quotation.objects.all()
        order_qs = Order.objects.all()
        shadow_clients = None

    stats = {
        'clients': {
            'total': client_qs.count(),
            'active': client_qs.filter(status='active').count(),
        },
        'tasks': {
            'pending': task_qs.filter(status='pending').count(),
            'overdue': task_qs.filter(status__in=['pending', 'in_progress'], due_date__lt=now).count(),
            'in_progress': task_qs.filter(status='in_progress').count(),
            'completed': task_qs.filter(status='completed').count(),
        },
        'pipeline': {
            'active_inquiries': inquiry_qs.exclude(stage__in=['order_confirmed', 'lost']).count(),
            'pending_approvals': quotation_qs.filter(status='pending_approval').count(),
        },
        'orders': {
            'total': order_qs.count(),
            'active': order_qs.filter(status__in=['confirmed', 'processing', 'shipped']).count(),
        },
        'revenue': {
            'total': order_qs.aggregate(total=Sum('total'))['total'] or 0,
        },
        'pipeline_by_stage': list(
            inquiry_qs.exclude(stage__in=['order_confirmed', 'lost'])
            .values('stage').annotate(count=Count('id'), value=Sum('expected_value'))
        ),
        'clients_by_country': list(
            client_qs.exclude(country='')
            .values('country').annotate(count=Count('id')).order_by('-count')[:10]
        ),
    }

    if shadow_clients is not None:
        stats['shadow_clients'] = shadow_clients

    return Response(stats)
