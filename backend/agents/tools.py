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


def _is_executive(user):
    """Check if user is an executive (restricted view)."""
    return user.role == 'executive'


def _resolve_client(user, client_id='', client_name=''):
    """
    Return (Client, error_str) given either a UUID or a plain company name.
    Tries client_id first; falls back to fuzzy name search.
    Respects executive access restrictions.
    """
    from clients.models import Client
    qs = Client.objects.filter(is_deleted=False)
    if _is_executive(user):
        from django.db.models import Q
        qs = qs.filter(
            Q(primary_executive=user) | Q(shadow_executive=user)
        )

    # Try by ID first (if it looks like a UUID / non-empty string treated as ID)
    if client_id:
        try:
            return qs.get(id=client_id), None
        except Exception:
            pass  # Fall through to name search

    # Try by name (case-insensitive partial match)
    if client_name:
        matches = qs.filter(company_name__icontains=client_name.strip())
        if matches.exists():
            return matches.first(), None
        return None, f"No client found matching '{client_name}'. Try search_clients to find the right name."

    return None, None


def get_dashboard_stats(user, **kwargs):
    """Get overview dashboard stats."""
    from clients.models import Client
    from tasks.models import Task
    from orders.models import Order
    from quotations.models import Inquiry
    from finance.models import Invoice
    from django.db.models import Q

    now = timezone.now()

    if _is_executive(user):
        my_clients = Client.objects.filter(is_deleted=False).filter(
            Q(primary_executive=user) | Q(shadow_executive=user)
        ).distinct()
        client_ids = my_clients.values_list('id', flat=True)
        return {
            'total_clients': my_clients.count(),
            'active_clients': my_clients.filter(status='active').count(),
            'open_tasks': Task.objects.filter(owner=user, status__in=['pending', 'in_progress']).count(),
            'overdue_tasks': Task.objects.filter(owner=user, status__in=['pending', 'in_progress'], due_date__lt=now).count(),
            'active_orders': Order.objects.filter(client_id__in=client_ids).exclude(status__in=['delivered', 'cancelled']).count(),
            'pipeline_inquiries': Inquiry.objects.filter(client_id__in=client_ids).exclude(stage__in=['order_confirmed', 'lost']).count(),
            'pending_invoices': Invoice.objects.filter(client_id__in=client_ids, status__in=['draft', 'sent']).count(),
        }

    return {
        'total_clients': Client.objects.filter(is_deleted=False).count(),
        'active_clients': Client.objects.filter(is_deleted=False, status='active').count(),
        'open_tasks': Task.objects.filter(status__in=['pending', 'in_progress']).count(),
        'overdue_tasks': Task.objects.filter(status__in=['pending', 'in_progress'], due_date__lt=now).count(),
        'active_orders': Order.objects.exclude(status__in=['delivered', 'cancelled']).count(),
        'pipeline_inquiries': Inquiry.objects.exclude(stage__in=['order_confirmed', 'lost']).count(),
        'pending_invoices': Invoice.objects.filter(status__in=['draft', 'sent']).count(),
    }


def search_clients(user, query='', limit='10', **kwargs):
    """Search clients by name, country, or business type."""
    from clients.models import Client
    from django.db.models import Q
    limit = _int(limit)
    qs = Client.objects.filter(is_deleted=False)
    if _is_executive(user):
        qs = qs.filter(Q(primary_executive=user) | Q(shadow_executive=user)).distinct()
    if query:
        qs = qs.filter(
            Q(company_name__icontains=query) |
            Q(country__icontains=query) |
            Q(business_type__icontains=query)
        )
    return [{
        'id': str(c.id), 'company_name': c.company_name, 'country': c.country,
        'status': c.status, 'business_type': c.business_type,
    } for c in qs[:limit]]


def get_client_summary(user, client_id='', client_name='', **kwargs):
    """Get a detailed summary of a specific client by name or ID."""
    client, err = _resolve_client(user, client_id=client_id, client_name=client_name)
    if err:
        return {'error': err}
    if not client:
        return {'error': 'Please provide a client name or ID.'}

    contacts = [{'name': ct.name, 'email': ct.email, 'phone': ct.phone, 'designation': ct.designation}
                for ct in client.contacts.filter(is_deleted=False)]

    recent_comms = [{'type': cm.comm_type, 'subject': cm.subject, 'direction': cm.direction,
                     'date': cm.created_at.isoformat()}
                    for cm in client.communications.all()[:5]]

    return {
        'company_name': client.company_name, 'country': client.country, 'city': client.city,
        'status': client.status, 'business_type': client.business_type,
        'delivery_terms': client.delivery_terms, 'currency': client.preferred_currency,
        'contacts': contacts,
        'stats': {
            'total_orders': client.orders.count(),
            'total_quotations': client.quotations.count(),
            'total_communications': client.communications.count(),
            'open_tasks': client.tasks.filter(status__in=['pending', 'in_progress']).count(),
        },
        'recent_communications': recent_comms,
    }


def get_tasks(user, status_filter='', client_id='', client_name='', limit='10', **kwargs):
    """Get tasks with optional filtering by status and/or client name."""
    from tasks.models import Task
    limit = _int(limit)
    qs = Task.objects.select_related('client', 'owner').all()
    if _is_executive(user):
        qs = qs.filter(owner=user)
    if status_filter:
        qs = qs.filter(status=status_filter)

    # Resolve client if provided
    if client_id or client_name:
        client, err = _resolve_client(user, client_id=client_id, client_name=client_name)
        if err:
            return [{'error': err}]
        if client:
            qs = qs.filter(client=client)

    return [{
        'id': str(t.id), 'title': t.title, 'status': t.status,
        'priority': t.priority, 'owner': t.owner.full_name if t.owner else '',
        'client': t.client.company_name if t.client else '',
        'due_date': t.due_date.isoformat() if t.due_date else None,
        'is_overdue': bool(t.due_date and t.due_date < timezone.now() and t.status in ['pending', 'in_progress']),
    } for t in qs[:limit]]


def create_task(user, title, client_id='', client_name='', priority='medium',
                due_date='', description='', owner_id='', owner_name='', **kwargs):
    """Create a new task. Accepts client name and owner name instead of IDs."""
    from tasks.models import Task
    from accounts.models import User as UserModel

    task_data = {
        'title': title,
        'priority': priority,
        'status': 'pending',
        'description': description,
        'created_by': user,
    }

    # Resolve client
    if client_id or client_name:
        client, err = _resolve_client(user, client_id=client_id, client_name=client_name)
        if err:
            return {'error': err}
        if client:
            task_data['client'] = client

    # Resolve owner
    if owner_id:
        try:
            task_data['owner'] = UserModel.objects.get(id=owner_id)
        except UserModel.DoesNotExist:
            pass
    elif owner_name:
        owner_match = UserModel.objects.filter(
            full_name__icontains=owner_name.strip(), is_active=True
        ).first()
        if owner_match:
            task_data['owner'] = owner_match
        else:
            task_data['owner'] = user
    else:
        task_data['owner'] = user

    if due_date:
        task_data['due_date'] = due_date

    task = Task.objects.create(**task_data)
    return {'id': str(task.id), 'title': task.title, 'status': 'created',
            'client': task.client.company_name if task.client else '', 'owner': task.owner.full_name if task.owner else ''}


def get_recent_communications(user, client_id='', client_name='', comm_type='', limit='10', **kwargs):
    """Get recent communications, optionally filtered by client name and type."""
    from communications.models import Communication
    from django.db.models import Q
    limit = _int(limit)
    qs = Communication.objects.select_related('client', 'user').all()

    if _is_executive(user):
        from clients.models import Client
        my_client_ids = Client.objects.filter(
            Q(primary_executive=user) | Q(shadow_executive=user), is_deleted=False
        ).distinct().values_list('id', flat=True)
        qs = qs.filter(client_id__in=my_client_ids)

    if client_id or client_name:
        client, err = _resolve_client(user, client_id=client_id, client_name=client_name)
        if err:
            return [{'error': err}]
        if client:
            qs = qs.filter(client=client)

    if comm_type and comm_type != 'all':
        qs = qs.filter(comm_type=comm_type)

    return [{
        'type': c.comm_type, 'direction': c.direction,
        'subject': c.subject, 'body': c.body[:200],
        'client': c.client.company_name if c.client else 'Unknown',
        'from_to': c.external_email or c.external_phone or '',
        'date': c.created_at.isoformat(),
    } for c in qs[:limit]]


def get_orders(user, client_id='', client_name='', status_filter='', limit='10', **kwargs):
    """Get orders, optionally filtered by client name or status."""
    from orders.models import Order
    from django.db.models import Q
    limit = _int(limit)
    qs = Order.objects.select_related('client').all()

    if _is_executive(user):
        from clients.models import Client
        my_client_ids = Client.objects.filter(
            Q(primary_executive=user) | Q(shadow_executive=user), is_deleted=False
        ).distinct().values_list('id', flat=True)
        qs = qs.filter(client_id__in=my_client_ids)

    if client_id or client_name:
        client, err = _resolve_client(user, client_id=client_id, client_name=client_name)
        if err:
            return [{'error': err}]
        if client:
            qs = qs.filter(client=client)

    if status_filter:
        qs = qs.filter(status=status_filter)

    return [{
        'order_number': o.order_number, 'client': o.client.company_name,
        'total': str(o.total), 'currency': o.currency, 'status': o.status,
        'date': o.created_at.isoformat(),
    } for o in qs[:limit]]


def get_shipments(user, client_id='', client_name='', status_filter='', limit='10', **kwargs):
    """Get shipments, optionally filtered by client name or status."""
    from shipments.models import Shipment
    from django.db.models import Q
    limit = _int(limit)
    qs = Shipment.objects.select_related('client', 'order').all()

    if _is_executive(user):
        from clients.models import Client
        my_client_ids = Client.objects.filter(
            Q(primary_executive=user) | Q(shadow_executive=user), is_deleted=False
        ).distinct().values_list('id', flat=True)
        qs = qs.filter(client_id__in=my_client_ids)

    if client_id or client_name:
        client, err = _resolve_client(user, client_id=client_id, client_name=client_name)
        if err:
            return [{'error': err}]
        if client:
            qs = qs.filter(client=client)

    if status_filter:
        qs = qs.filter(status=status_filter)

    return [{
        'shipment_number': s.shipment_number, 'client': s.client.company_name,
        'status': s.status, 'container': s.container_number,
        'dispatch_date': s.dispatch_date.isoformat() if s.dispatch_date else None,
        'eta': s.estimated_arrival.isoformat() if s.estimated_arrival else None,
    } for s in qs[:limit]]


def get_samples(user, client_id='', client_name='', status_filter='', limit='15', **kwargs):
    """Get samples, optionally filtered by client or status. Status values:
    requested / replied / prepared / payment_received / dispatched / delivered /
    feedback_pending / feedback_received."""
    from samples.models import Sample
    from django.db.models import Q
    limit = _int(limit, default=15)
    qs = Sample.objects.filter(is_deleted=False).select_related('client')

    if _is_executive(user):
        from clients.models import Client
        my_client_ids = Client.objects.filter(
            Q(primary_executive=user) | Q(shadow_executive=user), is_deleted=False
        ).distinct().values_list('id', flat=True)
        qs = qs.filter(client_id__in=my_client_ids)

    if client_id or client_name:
        client, err = _resolve_client(user, client_id=client_id, client_name=client_name)
        if err:
            return [{'error': err}]
        if client:
            qs = qs.filter(client=client)

    if status_filter:
        qs = qs.filter(status=status_filter)

    qs = qs.order_by('-created_at')[:limit]
    return [{
        'sample_number': s.sample_number,
        'client': s.client.company_name if s.client else '—',
        'product': s.product_name,
        'quantity': s.quantity,
        'status': s.status,
        'sample_type': s.sample_type or '',
        'dispatch_date': s.dispatch_date.isoformat() if s.dispatch_date else None,
        'created_at': s.created_at.isoformat(),
    } for s in qs]


def get_pipeline_summary(user, **kwargs):
    """Get pipeline/inquiry summary by stage."""
    from quotations.models import Inquiry
    from django.db.models import Count, Sum, Q
    qs = Inquiry.objects.all()
    if _is_executive(user):
        from clients.models import Client
        my_client_ids = Client.objects.filter(
            Q(primary_executive=user) | Q(shadow_executive=user), is_deleted=False
        ).distinct().values_list('id', flat=True)
        qs = qs.filter(client_id__in=my_client_ids)
    stages = qs.values('stage').annotate(
        count=Count('id'), total_value=Sum('expected_value')
    ).order_by('stage')
    return [{'stage': s['stage'], 'count': s['count'],
             'total_value': str(s['total_value'] or 0)} for s in stages]


def get_overdue_invoices(user, limit='10', **kwargs):
    """Get overdue invoices."""
    from finance.models import Invoice
    from django.db.models import Q
    limit = _int(limit)
    qs = Invoice.objects.filter(
        status__in=['sent', 'overdue'],
        due_date__lt=timezone.now().date()
    ).select_related('client')
    if _is_executive(user):
        from clients.models import Client
        my_client_ids = Client.objects.filter(
            Q(primary_executive=user) | Q(shadow_executive=user), is_deleted=False
        ).distinct().values_list('id', flat=True)
        qs = qs.filter(client_id__in=my_client_ids)
    return [{
        'invoice_number': inv.invoice_number, 'client': inv.client.company_name,
        'total': str(inv.total), 'currency': inv.currency,
        'due_date': inv.due_date.isoformat() if inv.due_date else None,
        'days_overdue': (timezone.now().date() - inv.due_date).days if inv.due_date else 0,
    } for inv in qs[:limit]]


def search_products(user, query='', limit='10', **kwargs):
    """Search products by name, category, active ingredient, or client brand name."""
    from products.models import Product
    from django.db.models import Q
    limit = _int(limit)
    qs = Product.objects.filter(is_deleted=False, is_active=True)
    if query:
        qs = qs.filter(
            Q(name__icontains=query) |
            Q(category__icontains=query) |
            Q(active_ingredient__icontains=query) |
            Q(client_brand_names__icontains=query) |
            Q(hsn_code__icontains=query)
        )
    return [{
        'id': str(p.id), 'name': p.name, 'category': p.category,
        'active_ingredient': p.active_ingredient, 'concentration': p.concentration,
        'base_price': str(p.base_price), 'currency': p.currency, 'unit': p.unit,
        'hsn_code': p.hsn_code,
        'client_brand_names': p.client_brand_names,
    } for p in qs[:limit]]


def get_product_details(user, product_name='', product_id='', **kwargs):
    """Get full details of a product including compliance rules and documents."""
    from products.models import Product
    from django.db.models import Q

    qs = Product.objects.filter(is_deleted=False)
    product = None

    if product_id:
        try:
            product = qs.get(id=product_id)
        except Product.DoesNotExist:
            pass

    if not product and product_name:
        product = qs.filter(
            Q(name__icontains=product_name.strip()) |
            Q(client_brand_names__icontains=product_name.strip())
        ).first()

    if not product:
        label = product_name or product_id
        return {'error': f"No product found matching '{label}'. Try search_products first."}

    compliance = [{'country': c.country, 'is_allowed': c.is_allowed, 'notes': c.notes}
                  for c in product.compliance_rules.all()]

    return {
        'name': product.name, 'category': product.category,
        'active_ingredient': product.active_ingredient, 'concentration': product.concentration,
        'description': product.description,
        'base_price': str(product.base_price), 'currency': product.currency, 'unit': product.unit,
        'hsn_code': product.hsn_code,
        'client_brand_names': product.client_brand_names,
        'compliance_by_country': compliance,
        'document_count': product.documents.count(),
    }


def get_finance_summary(user, **kwargs):
    """Aggregate finance metrics — invoices, payments, receivables, FIRC,
    overdue payments — for the AI summary on the Finance page.

    Returns shape (executives are scoped to their own clients):
      {
        'invoices': {'total': int, 'by_status': {...}, 'total_value': str, 'by_currency': {...}},
        'payments': {'total': int, 'total_value': str, 'by_mode': {...}, 'this_month_value': str},
        'receivables': {'outstanding_amount': str, 'overdue_amount': str, 'overdue_orders': int},
        'firc': {'pending': int, 'received': int},
        'overdue_invoices': [{invoice_number, client, total, currency, days_overdue}, ...],
        'orders_with_payment_risk': [{order_number, client, payment_terms, days_since_dispatch}, ...],
        'top_clients_by_revenue': [{client, total_paid}, ...],
      }
    """
    from datetime import date as _date
    from django.db.models import Sum, Count
    from finance.models import Invoice, Payment, FIRCRecord
    from orders.models import Order
    from orders.payment_terms import (
        parse_payment_terms, compute_advance_due_date, compute_balance_due_date,
    )

    inv_qs = Invoice.objects.filter(is_deleted=False)
    pay_qs = Payment.objects.filter(is_deleted=False)
    firc_qs = FIRCRecord.objects.filter(is_deleted=False)
    ord_qs = Order.objects.filter(is_deleted=False)

    if _is_executive(user):
        from clients.models import Client
        from django.db.models import Q
        my_client_ids = list(Client.objects.filter(
            Q(primary_executive=user) | Q(shadow_executive=user), is_deleted=False
        ).distinct().values_list('id', flat=True))
        inv_qs = inv_qs.filter(client_id__in=my_client_ids)
        pay_qs = pay_qs.filter(client_id__in=my_client_ids)
        firc_qs = firc_qs.filter(order__client_id__in=my_client_ids) | firc_qs.filter(sample__client_id__in=my_client_ids)
        ord_qs = ord_qs.filter(client_id__in=my_client_ids)

    today = _date.today()
    first_of_month = today.replace(day=1)

    inv_by_status = dict(inv_qs.values_list('status').annotate(c=Count('id')).values_list('status', 'c'))
    inv_by_currency = {
        row['currency']: str(row['total'] or 0)
        for row in inv_qs.values('currency').annotate(total=Sum('total'))
    }
    inv_total_value = str(inv_qs.aggregate(t=Sum('total'))['t'] or 0)

    pay_by_mode = dict(pay_qs.values_list('mode').annotate(c=Count('id')).values_list('mode', 'c'))
    pay_total_value = str(pay_qs.aggregate(t=Sum('amount'))['t'] or 0)
    pay_month_value = str(pay_qs.filter(payment_date__gte=first_of_month).aggregate(t=Sum('amount'))['t'] or 0)

    overdue_inv = list(inv_qs.filter(due_date__lt=today)
                       .exclude(status__in=['paid', 'cancelled'])
                       .select_related('client')[:15])
    overdue_summary = [{
        'invoice_number': i.invoice_number, 'client': i.client.company_name,
        'total': str(i.total), 'currency': i.currency,
        'days_overdue': (today - i.due_date).days if i.due_date else 0,
    } for i in overdue_inv]
    overdue_amount = sum((i.total for i in overdue_inv), 0)

    risk_orders = []
    for o in ord_qs.exclude(dispatched_at__isnull=True).select_related('client')[:300]:
        parsed = parse_payment_terms(o.payment_terms)
        flagged = False
        if parsed['has_balance'] and not o.balance_payment_received_at:
            d = compute_balance_due_date(o)
            if d and today > d:
                flagged = True
        if not flagged and parsed['has_advance'] and not o.advance_payment_received_at \
                and not o.advance_is_before_dispatch:
            d = compute_advance_due_date(o)
            if d and today > d:
                flagged = True
        if flagged:
            risk_orders.append({
                'order_number': o.order_number,
                'client': o.client.company_name if o.client else '—',
                'payment_terms': o.payment_terms,
                'days_since_dispatch': (today - o.dispatched_at.date()).days if o.dispatched_at else 0,
            })
        if len(risk_orders) >= 15:
            break

    top_clients = list(
        pay_qs.values('client__company_name')
        .annotate(total_paid=Sum('amount'))
        .order_by('-total_paid')[:5]
    )
    top_clients_summary = [
        {'client': r['client__company_name'], 'total_paid': str(r['total_paid'] or 0)}
        for r in top_clients
    ]

    return {
        'invoices': {
            'total': inv_qs.count(),
            'by_status': inv_by_status,
            'total_value': inv_total_value,
            'by_currency': inv_by_currency,
        },
        'payments': {
            'total': pay_qs.count(),
            'total_value': pay_total_value,
            'by_mode': pay_by_mode,
            'this_month_value': pay_month_value,
        },
        'receivables': {
            'outstanding_amount': str((inv_qs.exclude(status__in=['paid', 'cancelled'])
                                       .aggregate(t=Sum('total'))['t'] or 0)),
            'overdue_amount': str(overdue_amount),
            'overdue_count': len(overdue_summary),
        },
        'firc': {
            'pending': firc_qs.filter(status='pending').count(),
            'received': firc_qs.filter(status='received').count(),
        },
        'overdue_invoices': overdue_summary,
        'orders_with_payment_risk': risk_orders,
        'top_clients_by_revenue': top_clients_summary,
    }


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


def get_executive_overview(user, executive_username='', **kwargs):
    """Get detailed overview of all executives (admin/manager only)."""
    from accounts.models import User as UserModel
    from clients.models import Client
    from tasks.models import Task
    from orders.models import Order
    from quotations.models import Inquiry

    qs = UserModel.objects.filter(role='executive', is_active=True)
    if executive_username:
        qs = qs.filter(username__icontains=executive_username)

    executives = []
    for exec_user in qs:
        my_clients = Client.objects.filter(primary_executive=exec_user, is_deleted=False)
        client_ids = my_clients.values_list('id', flat=True)
        now = timezone.now()

        executives.append({
            'name': exec_user.full_name,
            'username': exec_user.username,
            'email': exec_user.email,
            'phone': exec_user.phone,
            'whatsapp': exec_user.whatsapp,
            'region': exec_user.region,
            'total_clients': my_clients.count(),
            'active_clients': my_clients.filter(status='active').count(),
            'client_names': list(my_clients.values_list('company_name', flat=True)),
            'open_tasks': Task.objects.filter(owner=exec_user, status__in=['pending', 'in_progress']).count(),
            'overdue_tasks': Task.objects.filter(owner=exec_user, status__in=['pending', 'in_progress'], due_date__lt=now).count(),
            'active_orders': Order.objects.filter(client_id__in=client_ids).exclude(status__in=['delivered', 'cancelled']).count(),
            'pipeline_inquiries': Inquiry.objects.filter(assigned_to=exec_user).exclude(stage__in=['order_confirmed', 'lost']).count(),
        })

    return executives


# ---------------------------------------------------------------------------
# Tool registry — maps function names to callables and their descriptions
# ---------------------------------------------------------------------------
TOOL_REGISTRY = {
    'get_dashboard_stats': {
        'fn': get_dashboard_stats,
        'description': 'Get CRM dashboard statistics including total clients, open tasks, active orders',
        'parameters': {},
    },
    'search_clients': {
        'fn': search_clients,
        'description': 'Search for clients by company name, country, or business type. Use this to find a client before calling get_client_summary.',
        'parameters': {
            'query': 'Name, country, or business type to search for',
            'limit': 'Max results (default 10)',
        },
    },
    'get_client_summary': {
        'fn': get_client_summary,
        'description': 'Get detailed summary of a specific client including contacts, communications, and stats. Provide client_name (preferred) or client_id.',
        'parameters': {
            'client_name': 'Company name (e.g. "Acme Corp") — preferred over client_id',
            'client_id': 'Client UUID — only use if you already have it',
        },
    },
    'get_tasks': {
        'fn': get_tasks,
        'description': 'Get tasks list, optionally filtered by status and/or client name',
        'parameters': {
            'status_filter': 'pending / in_progress / completed / cancelled',
            'client_name': 'Filter by client company name (e.g. "Acme Corp")',
            'client_id': 'Filter by client UUID — only if you already have it',
            'limit': 'Max results (default 10)',
        },
    },
    'create_task': {
        'fn': create_task,
        'description': 'Create a new task. Use client_name and owner_name instead of IDs.',
        'parameters': {
            'title': 'Task title (required)',
            'client_name': 'Client company name (e.g. "Acme Corp")',
            'owner_name': 'Full name of the person to assign the task to',
            'priority': 'low / medium / high / urgent (default medium)',
            'due_date': 'ISO date string e.g. 2025-06-01',
            'description': 'Optional task details',
        },
    },
    'get_recent_communications': {
        'fn': get_recent_communications,
        'description': 'Get recent emails, WhatsApp messages, calls, and notes. Filter by client name and/or type.',
        'parameters': {
            'client_name': 'Filter by client company name (e.g. "Acme Corp")',
            'client_id': 'Filter by client UUID — only if you already have it',
            'comm_type': 'email / whatsapp / call / note (omit for all)',
            'limit': 'Max results (default 10)',
        },
    },
    'get_orders': {
        'fn': get_orders,
        'description': 'Get sales orders, optionally filtered by client name or order status',
        'parameters': {
            'client_name': 'Filter by client company name (e.g. "Acme Corp")',
            'client_id': 'Client UUID — only if you already have it',
            'status_filter': 'confirmed / processing / shipped / delivered / cancelled',
            'limit': 'Max results (default 10)',
        },
    },
    'get_shipments': {
        'fn': get_shipments,
        'description': 'Get shipments with tracking info, optionally filtered by client name or shipment status',
        'parameters': {
            'client_name': 'Filter by client company name (e.g. "Acme Corp")',
            'client_id': 'Client UUID — only if you already have it',
            'status_filter': 'pending / dispatched / in_transit / delivered',
            'limit': 'Max results (default 10)',
        },
    },
    'get_samples': {
        'fn': get_samples,
        'description': 'Get sample requests, optionally filtered by client or status. Status values: requested / replied / prepared / payment_received / dispatched / delivered / feedback_pending / feedback_received.',
        'parameters': {
            'client_name': 'Filter by client company name',
            'client_id': 'Client UUID — only if you already have it',
            'status_filter': 'One of the sample statuses (omit for all)',
            'limit': 'Max results (default 15)',
        },
    },
    'get_pipeline_summary': {
        'fn': get_pipeline_summary,
        'description': 'Get sales pipeline summary grouped by stage with counts and total values',
        'parameters': {},
    },
    'get_overdue_invoices': {
        'fn': get_overdue_invoices,
        'description': 'Get list of overdue invoices that need attention',
        'parameters': {'limit': 'Max results (default 10)'},
    },
    'get_finance_summary': {
        'fn': get_finance_summary,
        'description': 'Get a complete finance snapshot: invoice counts by status, total invoice value (by currency), payments + this-month total, outstanding receivables, overdue invoices, orders with payment risk, FIRC pending vs received, and top clients by revenue. Use whenever the user asks for a finance summary, revenue breakdown, receivables, or overdue payments.',
        'parameters': {},
    },
    'search_products': {
        'fn': search_products,
        'description': 'Search the product catalogue by name, category, active ingredient, or client brand name. Use this whenever the user asks about a product.',
        'parameters': {
            'query': 'Product name, ingredient, category, or brand alias (e.g. "azadirachtin", "fungicide", "aza")',
            'limit': 'Max results (default 10)',
        },
    },
    'get_product_details': {
        'fn': get_product_details,
        'description': 'Get full details of a product including pricing, compliance by country, and documents. Use product_name (preferred) or product_id.',
        'parameters': {
            'product_name': 'Product name or brand alias (preferred over product_id)',
            'product_id': 'Product UUID — only use if you already have it',
        },
    },
}

# Additional tools only available to admin/manager
ADMIN_TOOL_REGISTRY = {
    'get_executive_overview': {
        'fn': get_executive_overview,
        'description': 'Get detailed overview of all executives including their email, phone, region, assigned clients, open tasks, and performance metrics. Use this when asked about team, executives, or workload.',
        'parameters': {'executive_username': 'Optional: filter by executive username or name'},
    },
}


def _get_tools_for_user(user):
    """Return the tool registry appropriate for the user's role."""
    if user.role in ('admin', 'manager'):
        return {**TOOL_REGISTRY, **ADMIN_TOOL_REGISTRY}
    return TOOL_REGISTRY
