"""CRM tool functions that AI agents can call to read/write data."""
import json
from django.utils import timezone
from datetime import timedelta


def _int(val, default=10):
    """Safely convert a value to int (LLM sends strings)."""
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def get_dashboard_stats(user):
    """Get overview dashboard stats."""
    from clients.models import Client
    from tasks.models import Task
    from orders.models import Order
    from quotations.models import Inquiry
    from finance.models import Invoice

    now = timezone.now()
    return {
        'total_clients': Client.objects.filter(is_deleted=False).count(),
        'active_clients': Client.objects.filter(is_deleted=False, status='active').count(),
        'open_tasks': Task.objects.filter(status__in=['pending', 'in_progress']).count(),
        'overdue_tasks': Task.objects.filter(status__in=['pending', 'in_progress'], due_date__lt=now).count(),
        'active_orders': Order.objects.exclude(status__in=['delivered', 'cancelled']).count(),
        'pipeline_inquiries': Inquiry.objects.filter(stage__in=['new', 'contacted', 'proposal']).count(),
        'pending_invoices': Invoice.objects.filter(status__in=['draft', 'sent']).count(),
    }


def search_clients(query='', limit='10', **kwargs):
    """Search clients by name, country, or business type."""
    from clients.models import Client
    limit = _int(limit)
    qs = Client.objects.filter(is_deleted=False)
    if query:
        from django.db.models import Q
        qs = qs.filter(
            Q(company_name__icontains=query) |
            Q(country__icontains=query) |
            Q(business_type__icontains=query)
        )
    clients = qs[:limit]
    return [{
        'id': str(c.id), 'company_name': c.company_name, 'country': c.country,
        'status': c.status, 'business_type': c.business_type,
    } for c in clients]


def get_client_summary(client_id, **kwargs):
    """Get a detailed summary of a specific client."""
    from clients.models import Client
    try:
        c = Client.objects.get(id=client_id, is_deleted=False)
    except Client.DoesNotExist:
        return {'error': 'Client not found'}

    contacts = [{'name': ct.name, 'email': ct.email, 'phone': ct.phone, 'designation': ct.designation}
                for ct in c.contacts.filter(is_deleted=False)]

    recent_comms = [{'type': cm.comm_type, 'subject': cm.subject, 'direction': cm.direction,
                     'date': cm.created_at.isoformat()}
                    for cm in c.communications.all()[:5]]

    return {
        'company_name': c.company_name, 'country': c.country, 'city': c.city,
        'status': c.status, 'business_type': c.business_type,
        'delivery_terms': c.delivery_terms, 'currency': c.preferred_currency,
        'contacts': contacts,
        'stats': {
            'total_orders': c.orders.count(),
            'total_quotations': c.quotations.count(),
            'total_communications': c.communications.count(),
            'open_tasks': c.tasks.filter(status__in=['pending', 'in_progress']).count(),
        },
        'recent_communications': recent_comms,
    }


def get_tasks(status_filter='', client_id='', limit='10', **kwargs):
    """Get tasks with optional filtering."""
    from tasks.models import Task
    limit = _int(limit)
    qs = Task.objects.select_related('client', 'owner').all()
    if status_filter:
        qs = qs.filter(status=status_filter)
    if client_id:
        qs = qs.filter(client_id=client_id)
    tasks = qs[:limit]
    return [{
        'id': str(t.id), 'title': t.title, 'status': t.status,
        'priority': t.priority, 'owner': t.owner.full_name if t.owner else '',
        'client': t.client.company_name if t.client else '',
        'due_date': t.due_date.isoformat() if t.due_date else None,
        'is_overdue': t.due_date and t.due_date < timezone.now() and t.status in ['pending', 'in_progress'],
    } for t in tasks]


def create_task(title, client_id='', priority='medium', due_date='', description='', owner_id='', **kwargs):
    """Create a new task."""
    from tasks.models import Task
    from accounts.models import User
    task_data = {
        'title': title,
        'priority': priority,
        'status': 'pending',
        'description': description,
    }
    if client_id:
        task_data['client_id'] = client_id
    if owner_id:
        task_data['owner_id'] = owner_id
    else:
        task_data['owner'] = User.objects.first()
    if due_date:
        task_data['due_date'] = due_date
    task = Task.objects.create(**task_data)
    return {'id': str(task.id), 'title': task.title, 'status': 'created'}


def get_recent_communications(client_id='', comm_type='', limit='10', **kwargs):
    """Get recent communications."""
    from communications.models import Communication
    limit = _int(limit)
    qs = Communication.objects.select_related('client', 'user').all()
    if client_id:
        qs = qs.filter(client_id=client_id)
    if comm_type and comm_type != 'all':
        qs = qs.filter(comm_type=comm_type)
    comms = qs[:limit]
    return [{
        'type': c.comm_type, 'direction': c.direction,
        'subject': c.subject, 'body': c.body[:200],
        'client': c.client.company_name if c.client else 'Unknown',
        'from_to': c.external_email or c.external_phone or '',
        'date': c.created_at.isoformat(),
    } for c in comms]


def get_orders(client_id='', status_filter='', limit='10', **kwargs):
    """Get orders with optional filtering."""
    from orders.models import Order
    limit = _int(limit)
    qs = Order.objects.select_related('client').all()
    if client_id:
        qs = qs.filter(client_id=client_id)
    if status_filter:
        qs = qs.filter(status=status_filter)
    return [{
        'order_number': o.order_number, 'client': o.client.company_name,
        'total': str(o.total), 'currency': o.currency, 'status': o.status,
        'date': o.created_at.isoformat(),
    } for o in qs[:limit]]


def get_shipments(client_id='', status_filter='', limit='10', **kwargs):
    """Get shipments with optional filtering."""
    from shipments.models import Shipment
    limit = _int(limit)
    qs = Shipment.objects.select_related('client', 'order').all()
    if client_id:
        qs = qs.filter(client_id=client_id)
    if status_filter:
        qs = qs.filter(status=status_filter)
    return [{
        'shipment_number': s.shipment_number, 'client': s.client.company_name,
        'status': s.status, 'container': s.container_number,
        'dispatch_date': s.dispatch_date.isoformat() if s.dispatch_date else None,
        'eta': s.estimated_arrival.isoformat() if s.estimated_arrival else None,
    } for s in qs[:limit]]


def get_pipeline_summary(**kwargs):
    """Get pipeline/inquiry summary by stage."""
    from quotations.models import Inquiry
    from django.db.models import Count, Sum
    stages = Inquiry.objects.values('stage').annotate(
        count=Count('id'), total_value=Sum('expected_value')
    ).order_by('stage')
    return [{'stage': s['stage'], 'count': s['count'],
             'total_value': str(s['total_value'] or 0)} for s in stages]


def get_overdue_invoices(limit='10', **kwargs):
    """Get overdue invoices."""
    from finance.models import Invoice
    limit = _int(limit)
    invoices = Invoice.objects.filter(
        status__in=['sent', 'overdue'],
        due_date__lt=timezone.now().date()
    ).select_related('client')[:limit]
    return [{
        'invoice_number': inv.invoice_number, 'client': inv.client.company_name,
        'total': str(inv.total), 'currency': inv.currency,
        'due_date': inv.due_date.isoformat() if inv.due_date else None,
        'days_overdue': (timezone.now().date() - inv.due_date).days if inv.due_date else 0,
    } for inv in invoices]


def summarize_email(communication_id, **kwargs):
    """Get an email's full content for summarization."""
    from communications.models import Communication
    try:
        c = Communication.objects.get(id=communication_id)
        return {
            'subject': c.subject, 'body': c.body,
            'direction': c.direction, 'from_to': c.external_email,
            'date': c.created_at.isoformat(),
        }
    except Communication.DoesNotExist:
        return {'error': 'Communication not found'}


def draft_email_reply(communication_id, **kwargs):
    """Get email thread context for drafting a reply."""
    from communications.models import Communication
    try:
        c = Communication.objects.get(id=communication_id)
        # Get thread context
        thread = Communication.objects.filter(
            client=c.client, comm_type='email'
        ).order_by('-created_at')[:5]
        return {
            'original': {'subject': c.subject, 'body': c.body[:500], 'from': c.external_email},
            'thread': [{'subject': t.subject, 'body': t.body[:200], 'direction': t.direction,
                        'date': t.created_at.isoformat()} for t in thread],
            'client_name': c.client.company_name if c.client else 'Unknown',
        }
    except Communication.DoesNotExist:
        return {'error': 'Communication not found'}


# Tool registry — maps function names to callables and their descriptions
TOOL_REGISTRY = {
    'get_dashboard_stats': {
        'fn': get_dashboard_stats,
        'description': 'Get CRM dashboard statistics including total clients, open tasks, active orders',
        'parameters': {},
    },
    'search_clients': {
        'fn': search_clients,
        'description': 'Search for clients by name, country, or business type',
        'parameters': {'query': 'Search query string', 'limit': 'Max results (default 10)'},
    },
    'get_client_summary': {
        'fn': get_client_summary,
        'description': 'Get detailed summary of a specific client including contacts, recent communications, and stats',
        'parameters': {'client_id': 'UUID of the client'},
    },
    'get_tasks': {
        'fn': get_tasks,
        'description': 'Get tasks list, optionally filtered by status or client',
        'parameters': {'status_filter': 'pending/in_progress/completed', 'client_id': 'Filter by client UUID', 'limit': 'Max results'},
    },
    'create_task': {
        'fn': create_task,
        'description': 'Create a new task',
        'parameters': {'title': 'Task title (required)', 'client_id': 'Client UUID', 'priority': 'low/medium/high/urgent', 'due_date': 'ISO date', 'description': 'Details'},
    },
    'get_recent_communications': {
        'fn': get_recent_communications,
        'description': 'Get recent emails, WhatsApp messages, calls, and notes',
        'parameters': {'client_id': 'Filter by client UUID', 'comm_type': 'email/whatsapp/call/note', 'limit': 'Max results'},
    },
    'get_orders': {
        'fn': get_orders,
        'description': 'Get orders list, optionally filtered by client or status',
        'parameters': {'client_id': 'Client UUID', 'status_filter': 'confirmed/processing/shipped/delivered', 'limit': 'Max results'},
    },
    'get_shipments': {
        'fn': get_shipments,
        'description': 'Get shipments list with tracking info',
        'parameters': {'client_id': 'Client UUID', 'status_filter': 'pending/dispatched/in_transit/delivered', 'limit': 'Max results'},
    },
    'get_pipeline_summary': {
        'fn': get_pipeline_summary,
        'description': 'Get sales pipeline summary grouped by stage with counts and values',
        'parameters': {},
    },
    'get_overdue_invoices': {
        'fn': get_overdue_invoices,
        'description': 'Get list of overdue invoices that need attention',
        'parameters': {'limit': 'Max results'},
    },
}
