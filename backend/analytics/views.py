from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db.models import Count, Sum, Q
from django.utils import timezone
from clients.models import Client, ClientAssignment
from orders.models import Order
from tasks.models import Task
from quotations.models import Inquiry, Quotation
from finance.models import Invoice
from communications.models import Communication
from samples.models import Sample


def _get_exec_client_ids(user):
    """Return queryset of client IDs accessible to an executive,
    including executive-level shadow access."""
    from accounts.models import ExecutiveShadow
    shadowed_exec_ids = list(
        ExecutiveShadow.objects.filter(shadow=user).values_list('executive_id', flat=True)
    )
    q = (
        Q(primary_executive=user) |
        Q(shadow_executive=user) |
        Q(assignments__user=user)
    )
    if shadowed_exec_ids:
        q |= Q(primary_executive_id__in=shadowed_exec_ids)
    return Client.objects.filter(
        is_deleted=False
    ).filter(q).distinct().values_list('id', flat=True)


@api_view(['GET'])
def dashboard_stats(request):
    user = request.user
    now = timezone.now()
    is_executive = user.role == 'executive'

    if is_executive:
        # Own clients (primary executive)
        own_client_ids = list(Client.objects.filter(
            is_deleted=False, primary_executive=user
        ).values_list('id', flat=True))

        # All accessible clients (including shadow)
        all_client_ids = _get_exec_client_ids(user)

        # Use own clients for main stats
        client_qs = Client.objects.filter(is_deleted=False, id__in=own_client_ids)
        task_qs = Task.objects.filter(Q(owner=user) | Q(client_id__in=own_client_ids))
        inquiry_qs = Inquiry.objects.filter(client_id__in=own_client_ids)
        quotation_qs = Quotation.objects.filter(client_id__in=own_client_ids)
        order_qs = Order.objects.filter(client_id__in=own_client_ids)

        # Shadow clients info
        from accounts.models import ExecutiveShadow
        shadowed_exec_ids = list(
            ExecutiveShadow.objects.filter(shadow=user).values_list('executive_id', flat=True)
        )
        shadow_q = Q(shadow_executive=user)
        if shadowed_exec_ids:
            shadow_q |= Q(primary_executive_id__in=shadowed_exec_ids)
        shadow_clients = list(
            Client.objects.filter(is_deleted=False).filter(shadow_q)
            .exclude(primary_executive=user)
            .values('id', 'company_name', 'status', 'country')
        )
        shadow_client_ids = [c['id'] for c in shadow_clients]
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
        # Detailed data for enhanced dashboard
        'recent_tasks': list(
            task_qs.filter(status__in=['pending', 'in_progress'])
            .select_related('client', 'owner')
            .order_by('due_date', '-priority')[:5]
            .values('id', 'title', 'status', 'priority', 'due_date', 'owner__first_name', 'owner__last_name', 'client__company_name', 'status_note')
        ),
        'pending_quotations': list(
            quotation_qs.filter(status__in=['draft', 'pending_approval'])
            .select_related('client')
            .order_by('-created_at')[:5]
            .values('id', 'quotation_number', 'status', 'total', 'currency', 'client__company_name', 'created_at')
        ),
        'recent_orders': list(
            order_qs.exclude(status__in=['delivered', 'cancelled'])
            .select_related('client')
            .order_by('-created_at')[:5]
            .values('id', 'order_number', 'status', 'total', 'currency', 'client__company_name', 'created_at')
        ),
        'draft_emails': Communication.objects.filter(
            is_deleted=False, direction='inbound',
            **({'client_id__in': own_client_ids} if is_executive else {})
        ).filter(
            Q(drafts__status='draft')
        ).distinct().count(),
        'unread_emails': Communication.objects.filter(
            is_deleted=False, is_read=False, direction='inbound', is_client_mail=True,
            **({'client_id__in': own_client_ids} if is_executive else {})
        ).count(),
        'quotations_summary': {
            'draft': quotation_qs.filter(status='draft').count(),
            'pending_approval': quotation_qs.filter(status='pending_approval').count(),
            'approved': quotation_qs.filter(status='approved').count(),
            'sent': quotation_qs.filter(status='sent').count(),
        },
        'orders_by_status': list(
            order_qs.values('status').annotate(count=Count('id')).order_by('status')
        ),
    }

    # ── Admin/manager-only tiles ──────────────────────────────────────────
    # Pending orders = anything not yet delivered or cancelled.
    # Pending samples = anything before feedback_received (still in flight).
    if not is_executive:
        stats['pending_orders'] = Order.objects.exclude(
            status__in=['delivered', 'cancelled']
        ).count()
        stats['pending_samples'] = Sample.objects.exclude(
            status__in=['feedback_received']
        ).count()

    if shadow_clients is not None:
        stats['shadow_clients'] = shadow_clients
        if shadow_client_ids:
            s_task_qs = Task.objects.filter(client_id__in=shadow_client_ids)
            s_inquiry_qs = Inquiry.objects.filter(client_id__in=shadow_client_ids)
            s_quotation_qs = Quotation.objects.filter(client_id__in=shadow_client_ids)
            s_order_qs = Order.objects.filter(client_id__in=shadow_client_ids)
            stats['shadow_stats'] = {
                'clients': {'total': len(shadow_client_ids), 'active': Client.objects.filter(id__in=shadow_client_ids, status='active').count()},
                'tasks': {
                    'pending': s_task_qs.filter(status='pending').count(),
                    'in_progress': s_task_qs.filter(status='in_progress').count(),
                    'completed': s_task_qs.filter(status='completed').count(),
                    'overdue': s_task_qs.filter(status__in=['pending', 'in_progress'], due_date__lt=now).count(),
                },
                'pipeline': {'active_inquiries': s_inquiry_qs.exclude(stage__in=['order_confirmed', 'lost']).count()},
                'orders': {'total': s_order_qs.count(), 'active': s_order_qs.exclude(status__in=['delivered', 'cancelled']).count()},
                'unread_emails': Communication.objects.filter(is_deleted=False, is_read=False, direction='inbound', is_client_mail=True, client_id__in=shadow_client_ids).count(),
                'draft_emails': Communication.objects.filter(is_deleted=False, direction='inbound', client_id__in=shadow_client_ids).filter(Q(drafts__status='draft')).distinct().count(),
                'quotations_summary': {
                    'draft': s_quotation_qs.filter(status='draft').count(),
                    'pending_approval': s_quotation_qs.filter(status='pending_approval').count(),
                    'approved': s_quotation_qs.filter(status='approved').count(),
                    'sent': s_quotation_qs.filter(status='sent').count(),
                },
                'recent_tasks': list(s_task_qs.filter(status__in=['pending', 'in_progress']).order_by('due_date', '-priority')[:5].values('id', 'title', 'status', 'priority', 'due_date', 'owner__first_name', 'owner__last_name', 'client__company_name', 'status_note')),
                'pending_quotations': list(s_quotation_qs.filter(status__in=['draft', 'pending_approval']).order_by('-created_at')[:5].values('id', 'quotation_number', 'status', 'total', 'currency', 'client__company_name', 'created_at')),
                'recent_orders': list(s_order_qs.exclude(status__in=['delivered', 'cancelled']).order_by('-created_at')[:5].values('id', 'order_number', 'status', 'total', 'currency', 'client__company_name', 'created_at')),
                'pipeline_by_stage': list(s_inquiry_qs.exclude(stage__in=['order_confirmed', 'lost']).values('stage').annotate(count=Count('id'), value=Sum('expected_value'))),
                'clients_by_country': list(
                    Client.objects.filter(id__in=shadow_client_ids, is_deleted=False)
                    .exclude(country='')
                    .values('country').annotate(count=Count('id')).order_by('-count')[:10]
                ),
                'revenue': {'total': s_order_qs.aggregate(total=Sum('total'))['total'] or 0},
            }

    return Response(stats)
