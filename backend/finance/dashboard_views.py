"""
Finance Dashboard endpoints — aggregated business analytics for the
executive Finance dashboard tab.

All endpoints are role-filtered: executives only see metrics for their
assigned clients, admin/manager see everything.
"""
from datetime import date, timedelta
from collections import defaultdict
from decimal import Decimal

from django.db.models import Sum, Count, Q, F, Max
from django.db.models.functions import TruncMonth, Coalesce
from django.utils import timezone
from rest_framework import permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import Invoice, Payment


class IsAdminOrManager(permissions.BasePermission):
    """Finance dashboard is restricted to admin and manager only.

    Executives can still hit the existing CRUD endpoints (their own
    invoices/payments are filtered by role on the viewsets), but the
    aggregate analytics endpoints are management-only.
    """
    message = 'Finance dashboard is restricted to admin and manager only.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) in ('admin', 'manager')
        )


# ── Shared helpers ────────────────────────────────────────────────────────

def _scope_invoices(user):
    """Return Invoice queryset scoped by role."""
    qs = Invoice.objects.filter(is_deleted=False).select_related('client')
    if user.role == 'executive':
        from clients.views import get_client_qs_for_user
        client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
        qs = qs.filter(client_id__in=client_ids)
    return qs


def _scope_payments(user):
    """Return Payment queryset scoped by role."""
    qs = Payment.objects.filter(is_deleted=False).select_related('client', 'invoice')
    if user.role == 'executive':
        from clients.views import get_client_qs_for_user
        client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
        qs = qs.filter(client_id__in=client_ids)
    return qs


def _parse_date(value, default=None):
    """Parse YYYY-MM-DD strings into date objects, falling back to default."""
    if not value:
        return default
    try:
        from datetime import datetime
        return datetime.strptime(value, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return default


def _apply_filters(qs, request, date_field='created_at'):
    """Apply common query filters: date range, client, country.

    `date_field` can be either a DateTimeField (e.g. created_at) or a
    DateField (e.g. payment_date). We detect which one it is so the
    `__date` lookup is only used on DateTimeField — using it on a DateField
    raises `FieldError: Unsupported lookup 'date' for DateField`.
    """
    from django.db.models import DateField, DateTimeField

    start = _parse_date(request.query_params.get('start'))
    end = _parse_date(request.query_params.get('end'))
    client_id = request.query_params.get('client')
    country = request.query_params.get('country')

    # Detect whether `date_field` is a DateField or DateTimeField on the
    # current model so we pick the right lookup syntax.
    is_datetime = False
    try:
        field = qs.model._meta.get_field(date_field)
        is_datetime = isinstance(field, DateTimeField)
    except Exception:
        is_datetime = True  # safest default for created_at/updated_at fields

    gte_lookup = f'{date_field}__date__gte' if is_datetime else f'{date_field}__gte'
    lte_lookup = f'{date_field}__date__lte' if is_datetime else f'{date_field}__lte'

    if start:
        qs = qs.filter(**{gte_lookup: start})
    if end:
        qs = qs.filter(**{lte_lookup: end})
    if client_id:
        qs = qs.filter(client_id=client_id)
    if country:
        qs = qs.filter(client__country__iexact=country)
    return qs


def _client_payment_totals(user):
    """Build a dict of {client_id: (total_paid, last_payment_date)}.

    Pre-computed once per request so we don't N+1 the Payment table while
    iterating clients in the revenue table.
    """
    rows = (
        _scope_payments(user)
        .values('client_id')
        .annotate(total_paid=Coalesce(Sum('amount'), Decimal('0')),
                  last_payment=Max('payment_date'))
    )
    return {r['client_id']: (r['total_paid'] or Decimal('0'), r['last_payment']) for r in rows}


# ── 1. Summary cards ──────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def finance_summary(request):
    """KPI cards for the top of the dashboard.

    Returns total revenue (invoiced), total paid, total outstanding,
    overdue amount, and a comparison delta vs the previous period of the
    same length.
    """
    invoices = _apply_filters(_scope_invoices(request.user), request)
    payments = _apply_filters(_scope_payments(request.user), request, date_field='payment_date')

    total_revenue = invoices.aggregate(s=Coalesce(Sum('total'), Decimal('0')))['s']
    total_paid = payments.aggregate(s=Coalesce(Sum('amount'), Decimal('0')))['s']
    total_outstanding = total_revenue - total_paid

    # Overdue: invoices past due date that aren't fully paid
    today = timezone.now().date()
    overdue_invoices = invoices.filter(due_date__lt=today).exclude(status__in=['paid', 'cancelled'])
    overdue_total = Decimal('0')
    for inv in overdue_invoices:
        paid = sum(
            (p.amount or Decimal('0')) for p in inv.payments.filter(is_deleted=False)
        ) if hasattr(inv, 'payments') else Decimal('0')
        overdue_total += max((inv.total or Decimal('0')) - paid, Decimal('0'))

    # Trend delta vs previous period of equal length (default = last 30 days)
    start = _parse_date(request.query_params.get('start'))
    end = _parse_date(request.query_params.get('end')) or today
    if not start:
        start = end - timedelta(days=30)
    # Guard against inverted ranges so the timedelta math never crashes
    if end < start:
        end = start
    period_days = max((end - start).days, 1)
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=period_days)

    prev_revenue = (
        _scope_invoices(request.user)
        .filter(created_at__date__gte=prev_start, created_at__date__lte=prev_end)
        .aggregate(s=Coalesce(Sum('total'), Decimal('0')))['s']
    )
    if prev_revenue and prev_revenue > 0:
        revenue_delta_pct = float(((total_revenue - prev_revenue) / prev_revenue) * 100)
    else:
        revenue_delta_pct = None

    return Response({
        'total_revenue': float(total_revenue),
        'total_paid': float(total_paid),
        'total_outstanding': float(total_outstanding),
        'overdue_amount': float(overdue_total),
        'overdue_count': overdue_invoices.count(),
        'revenue_delta_pct': revenue_delta_pct,
        'period': {'start': start.isoformat(), 'end': end.isoformat()},
        'currency': 'USD',
    })


# ── 2. Revenue by client ──────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def revenue_by_client(request):
    """Per-client revenue/paid/outstanding/credit-status table data."""
    today = timezone.now().date()
    invoices = _apply_filters(_scope_invoices(request.user), request)
    payments_map = _client_payment_totals(request.user)

    # Group invoices by client
    grouped = (
        invoices.values('client_id', 'client__company_name', 'client__country',
                        'client__credit_limit', 'client__credit_days')
        .annotate(total_revenue=Coalesce(Sum('total'), Decimal('0')))
    )

    rows = []
    for g in grouped:
        cid = g['client_id']
        if not cid:
            continue
        total_rev = g['total_revenue'] or Decimal('0')
        paid, last_payment = payments_map.get(cid, (Decimal('0'), None))
        outstanding = total_rev - paid

        # Has overdue?
        has_overdue = (
            _scope_invoices(request.user)
            .filter(client_id=cid, due_date__lt=today)
            .exclude(status__in=['paid', 'cancelled'])
            .exists()
        )

        credit_limit = g['client__credit_limit'] or Decimal('0')
        if outstanding <= 0:
            credit_status = 'good'
        elif has_overdue and credit_limit and outstanding > credit_limit:
            credit_status = 'high_risk'
        elif has_overdue:
            credit_status = 'overdue'
        else:
            credit_status = 'pending'

        rows.append({
            'client_id': str(cid),
            'client_name': g['client__company_name'] or '',
            'country': g['client__country'] or '',
            'total_revenue': float(total_rev),
            'total_paid': float(paid),
            'outstanding': float(outstanding),
            'last_payment_date': last_payment.isoformat() if last_payment else None,
            'credit_status': credit_status,
            'credit_limit': float(credit_limit),
            'credit_days': g['client__credit_days'] or 0,
        })

    rows.sort(key=lambda r: r['total_revenue'], reverse=True)
    return Response({'results': rows, 'count': len(rows)})


# ── 3. Aging analysis ─────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def aging_analysis(request):
    """Outstanding invoices bucketed by days overdue."""
    today = timezone.now().date()
    invoices = (
        _apply_filters(_scope_invoices(request.user), request)
        .exclude(status__in=['paid', 'cancelled'])
        .filter(due_date__isnull=False)
    )

    buckets = {
        '0_30': {'amount': Decimal('0'), 'invoice_count': 0, 'client_ids': set()},
        '31_60': {'amount': Decimal('0'), 'invoice_count': 0, 'client_ids': set()},
        '61_90': {'amount': Decimal('0'), 'invoice_count': 0, 'client_ids': set()},
        '90_plus': {'amount': Decimal('0'), 'invoice_count': 0, 'client_ids': set()},
    }

    for inv in invoices.prefetch_related('payments'):
        paid = sum(
            (p.amount or Decimal('0')) for p in inv.payments.filter(is_deleted=False)
        )
        outstanding = max((inv.total or Decimal('0')) - paid, Decimal('0'))
        if outstanding <= 0:
            continue

        days_overdue = (today - inv.due_date).days
        if days_overdue <= 30:
            key = '0_30'
        elif days_overdue <= 60:
            key = '31_60'
        elif days_overdue <= 90:
            key = '61_90'
        else:
            key = '90_plus'

        buckets[key]['amount'] += outstanding
        buckets[key]['invoice_count'] += 1
        if inv.client_id:
            buckets[key]['client_ids'].add(inv.client_id)

    result = []
    label_map = {
        '0_30': '0–30 Days',
        '31_60': '31–60 Days',
        '61_90': '61–90 Days',
        '90_plus': '90+ Days',
    }
    for key, label in label_map.items():
        b = buckets[key]
        result.append({
            'bucket': key,
            'label': label,
            'amount': float(b['amount']),
            'invoice_count': b['invoice_count'],
            'client_count': len(b['client_ids']),
        })
    return Response({'buckets': result, 'currency': 'USD'})


# ── 4. Revenue trend (monthly) ────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def revenue_trend(request):
    """Monthly revenue + payment trend for the last 12 months (line chart).

    Respects the same client/country/date filters as the rest of the
    dashboard so the chart stays in sync with the filter bar.
    """
    today = timezone.now().date()
    months = int(request.query_params.get('months', 12))
    default_start = today.replace(day=1) - timedelta(days=30 * months)

    # Resolve the chart's start/end window. We always want a sane span to
    # draw, even when the filter inputs are partial / invalid / future.
    requested_start = _parse_date(request.query_params.get('start'))
    requested_end = _parse_date(request.query_params.get('end'))

    start = requested_start or default_start
    end = requested_end or today

    # Guard against inverted ranges (end < start) — fall back to start..start
    if end < start:
        end = start

    # Apply role + client/country filters (NOT the date filter — we handle
    # the date window manually below so the chart axis is always continuous).
    invoice_qs = _scope_invoices(request.user)
    payment_qs = _scope_payments(request.user)

    client_id = request.query_params.get('client')
    country = request.query_params.get('country')
    if client_id:
        invoice_qs = invoice_qs.filter(client_id=client_id)
        payment_qs = payment_qs.filter(client_id=client_id)
    if country:
        invoice_qs = invoice_qs.filter(client__country__iexact=country)
        payment_qs = payment_qs.filter(client__country__iexact=country)

    # Date window for the chart series
    invoice_qs = invoice_qs.filter(created_at__date__gte=start, created_at__date__lte=end)
    payment_qs = payment_qs.filter(payment_date__gte=start, payment_date__lte=end)

    invoices = (
        invoice_qs
        .annotate(month=TruncMonth('created_at'))
        .values('month')
        .annotate(revenue=Coalesce(Sum('total'), Decimal('0')))
        .order_by('month')
    )
    payments = (
        payment_qs
        .annotate(month=TruncMonth('payment_date'))
        .values('month')
        .annotate(paid=Coalesce(Sum('amount'), Decimal('0')))
        .order_by('month')
    )

    rev_map = {r['month'].strftime('%Y-%m'): float(r['revenue']) for r in invoices}
    pay_map = {p['month'].strftime('%Y-%m'): float(p['paid']) for p in payments}

    # Build a continuous month series so the chart doesn't have gaps
    series = []
    cursor = start.replace(day=1)
    end_cursor = end.replace(day=1)
    # Hard cap iterations so a bad user input can never lock the worker
    iterations = 0
    while cursor <= end_cursor and iterations < 240:  # 20 years max
        key = cursor.strftime('%Y-%m')
        series.append({
            'month': key,
            'label': cursor.strftime('%b %Y'),
            'revenue': rev_map.get(key, 0.0),
            'paid': pay_map.get(key, 0.0),
        })
        # advance one month
        if cursor.month == 12:
            cursor = cursor.replace(year=cursor.year + 1, month=1)
        else:
            cursor = cursor.replace(month=cursor.month + 1)
        iterations += 1

    return Response({'series': series, 'currency': 'USD'})


# ── 5. Revenue by country ─────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def revenue_by_country(request):
    """Bar/pie chart data: invoiced revenue grouped by client country."""
    invoices = _apply_filters(_scope_invoices(request.user), request)
    rows = (
        invoices.values('client__country')
        .annotate(revenue=Coalesce(Sum('total'), Decimal('0')))
        .order_by('-revenue')
    )
    total = sum(float(r['revenue']) for r in rows) or 1.0
    result = []
    for r in rows:
        country = r['client__country'] or 'Unknown'
        rev = float(r['revenue'])
        result.append({
            'country': country,
            'revenue': rev,
            'percentage': round((rev / total) * 100, 2),
        })
    return Response({'results': result, 'currency': 'USD'})


# ── 6. Top products by revenue ────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def product_revenue(request):
    """Top products by revenue, sourced from InvoiceItem.

    Respects the same client/country/date filters as the dashboard.
    """
    from .models import InvoiceItem
    items_qs = InvoiceItem.objects.select_related('invoice', 'invoice__client')
    if request.user.role == 'executive':
        from clients.views import get_client_qs_for_user
        client_ids = get_client_qs_for_user(request.user).values_list('id', flat=True)
        items_qs = items_qs.filter(invoice__client_id__in=client_ids)
    items_qs = items_qs.filter(invoice__is_deleted=False)

    # Apply the same dashboard filters via the parent invoice
    start = _parse_date(request.query_params.get('start'))
    end = _parse_date(request.query_params.get('end'))
    client_id = request.query_params.get('client')
    country = request.query_params.get('country')
    if start:
        items_qs = items_qs.filter(invoice__created_at__date__gte=start)
    if end:
        items_qs = items_qs.filter(invoice__created_at__date__lte=end)
    if client_id:
        items_qs = items_qs.filter(invoice__client_id=client_id)
    if country:
        items_qs = items_qs.filter(invoice__client__country__iexact=country)

    rows = (
        items_qs.values('product_name')
        .annotate(revenue=Coalesce(Sum('total_price'), Decimal('0')))
        .order_by('-revenue')[:10]
    )
    total = sum(float(r['revenue']) for r in rows) or 1.0
    result = []
    for i, r in enumerate(rows, start=1):
        rev = float(r['revenue'])
        result.append({
            'rank': i,
            'product_name': r['product_name'] or '(unknown)',
            'revenue': rev,
            'percentage': round((rev / total) * 100, 2),
        })
    return Response({'results': result, 'currency': 'USD'})


# ── 7. Recent payments ────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def recent_payments(request):
    """Latest 10 payments for the recent activity tab."""
    qs = (
        _scope_payments(request.user)
        .order_by('-payment_date', '-created_at')[:10]
    )
    result = [{
        'id': str(p.id),
        'client_id': str(p.client_id) if p.client_id else None,
        'client_name': p.client.company_name if p.client else '',
        'invoice_number': p.invoice.invoice_number if p.invoice else '',
        'amount': float(p.amount or 0),
        'currency': p.currency or 'USD',
        'mode': p.mode or '',
        'payment_date': p.payment_date.isoformat() if p.payment_date else None,
        'reference': p.reference or '',
    } for p in qs]
    return Response({'results': result})


# ── 8. Recent invoices ────────────────────────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def recent_invoices(request):
    """Latest 10 invoices."""
    qs = _scope_invoices(request.user).order_by('-created_at')[:10]
    result = [{
        'id': str(i.id),
        'client_id': str(i.client_id) if i.client_id else None,
        'client_name': i.client.company_name if i.client else '',
        'invoice_number': i.invoice_number,
        'invoice_type': i.invoice_type,
        'total': float(i.total or 0),
        'currency': i.currency or 'USD',
        'status': i.status,
        'due_date': i.due_date.isoformat() if i.due_date else None,
        'created_at': i.created_at.isoformat() if i.created_at else None,
    } for i in qs]
    return Response({'results': result})


# ── 9. Payment status breakdown (donut) ──────────────────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def payment_status_breakdown(request):
    """Counts of invoices by status for the donut chart."""
    today = timezone.now().date()
    invoices = _apply_filters(_scope_invoices(request.user), request)

    paid = invoices.filter(status='paid').count()
    partial = invoices.filter(status='partial').count()
    unpaid = invoices.filter(status__in=['draft', 'sent']).count()
    overdue = invoices.filter(due_date__lt=today).exclude(status__in=['paid', 'cancelled']).count()

    return Response({
        'segments': [
            {'label': 'Paid', 'value': paid, 'color': '#10b981'},
            {'label': 'Partial', 'value': partial, 'color': '#3b82f6'},
            {'label': 'Unpaid', 'value': unpaid, 'color': '#f59e0b'},
            {'label': 'Overdue', 'value': overdue, 'color': '#ef4444'},
        ]
    })


# ── 10. Per-client financial details (for the drawer) ────────────────────

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsAdminOrManager])
def client_financial_details(request, client_id):
    """Full financial breakdown for a single client (drawer view)."""
    from clients.models import Client
    try:
        client = Client.objects.get(id=client_id, is_deleted=False)
    except Client.DoesNotExist:
        return Response({'error': 'Client not found'}, status=404)

    # Role gate
    if request.user.role == 'executive':
        from clients.views import get_client_qs_for_user
        if not get_client_qs_for_user(request.user).filter(id=client_id).exists():
            return Response({'error': 'Forbidden'}, status=403)

    invoices = (
        Invoice.objects.filter(client=client, is_deleted=False)
        .select_related('order')
        .order_by('-created_at')
    )
    payments = (
        Payment.objects.filter(client=client, is_deleted=False)
        .select_related('invoice')
        .order_by('-payment_date')
    )

    today = timezone.now().date()
    total_revenue = invoices.aggregate(s=Coalesce(Sum('total'), Decimal('0')))['s']
    total_paid = payments.aggregate(s=Coalesce(Sum('amount'), Decimal('0')))['s']
    outstanding = total_revenue - total_paid

    # Aging summary just for this client
    aging = {'0_30': 0.0, '31_60': 0.0, '61_90': 0.0, '90_plus': 0.0}
    for inv in invoices.exclude(status__in=['paid', 'cancelled']).filter(due_date__isnull=False):
        inv_paid = sum((p.amount or Decimal('0')) for p in inv.payments.filter(is_deleted=False))
        out = max((inv.total or Decimal('0')) - inv_paid, Decimal('0'))
        if out <= 0:
            continue
        days = (today - inv.due_date).days
        if days < 0:
            continue  # not yet due
        if days <= 30:
            aging['0_30'] += float(out)
        elif days <= 60:
            aging['31_60'] += float(out)
        elif days <= 90:
            aging['61_90'] += float(out)
        else:
            aging['90_plus'] += float(out)

    invoices_data = [{
        'id': str(i.id),
        'invoice_number': i.invoice_number,
        'invoice_type': i.invoice_type,
        'total': float(i.total or 0),
        'currency': i.currency or 'USD',
        'status': i.status,
        'due_date': i.due_date.isoformat() if i.due_date else None,
        'created_at': i.created_at.isoformat() if i.created_at else None,
    } for i in invoices[:50]]

    payments_data = [{
        'id': str(p.id),
        'invoice_number': p.invoice.invoice_number if p.invoice else '',
        'amount': float(p.amount or 0),
        'currency': p.currency or 'USD',
        'mode': p.mode or '',
        'payment_date': p.payment_date.isoformat() if p.payment_date else None,
        'reference': p.reference or '',
    } for p in payments[:50]]

    # FIRC summary — count of records and total amount
    firc_count = 0
    try:
        from .models import FIRCRecord
        firc_count = FIRCRecord.objects.filter(payment__client=client).count()
    except Exception:
        pass

    return Response({
        'client': {
            'id': str(client.id),
            'company_name': client.company_name,
            'country': client.country or '',
            'credit_limit': float(client.credit_limit or 0),
            'credit_days': client.credit_days or 0,
            'preferred_currency': client.preferred_currency or 'USD',
            'tax_number': client.tax_number or '',
        },
        'totals': {
            'total_revenue': float(total_revenue),
            'total_paid': float(total_paid),
            'outstanding': float(outstanding),
        },
        'aging': aging,
        'invoices': invoices_data,
        'payments': payments_data,
        'firc_count': firc_count,
    })
