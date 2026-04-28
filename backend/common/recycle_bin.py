"""
Recycle Bin — centralized API for viewing, restoring, and purging soft-deleted records.
"""
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from django.apps import apps
from datetime import timedelta

# Models that support soft delete (model_label -> display name)
RECYCLABLE_MODELS = {
    'clients.Client': 'Account',
    'clients.Contact': 'Contact',
    'communications.Communication': 'Activity',
    'communications.QuoteRequest': 'Inquiry',
    'quotations.Inquiry': 'Lead',
    'quotations.Quotation': 'Quote',
    'orders.Order': 'Sales Order',
    'shipments.Shipment': 'Shipment',
    'finance.Invoice': 'Invoice',
    'finance.Payment': 'Payment',
    'finance.ProformaInvoice': 'Proforma Invoice',
    'tasks.Task': 'Task',
    'meetings.CallLog': 'Meeting',
    'quality.Inspection': 'Inspection',
    'quality.COADocument': 'COA Document',
    'samples.Sample': 'Sample',
    'documents.Document': 'Document',
    'products.Product': 'Product',
}


def _get_display(obj, model_label):
    """Get a human-readable display string for a deleted object."""
    # For Communications, show classification + subject
    if model_label == 'communications.Communication':
        classification = getattr(obj, 'classification', '')
        subject = obj.subject or 'No subject'
        if classification and classification != 'client':
            return f'[{classification.title()}] {subject}'
        return subject
    # For Quote Requests (Inquiries)
    if model_label == 'communications.QuoteRequest':
        product = getattr(obj, 'extracted_product', '') or 'Unknown product'
        sender = getattr(obj, 'sender_name', '') or getattr(obj, 'sender_email', '') or ''
        return f'{product} - {sender}' if sender else product
    # For Proforma Invoices
    if model_label == 'finance.ProformaInvoice':
        return f'PI {obj.invoice_number} - {obj.client_company_name}'
    if hasattr(obj, 'company_name'):
        return obj.company_name
    if hasattr(obj, 'name') and obj.name:
        return obj.name
    if hasattr(obj, 'title') and obj.title:
        return obj.title
    if hasattr(obj, 'quotation_number'):
        return obj.quotation_number
    if hasattr(obj, 'order_number'):
        return obj.order_number
    if hasattr(obj, 'shipment_number'):
        return obj.shipment_number
    if hasattr(obj, 'invoice_number'):
        return obj.invoice_number
    if hasattr(obj, 'subject') and obj.subject:
        return obj.subject
    if hasattr(obj, 'agenda') and obj.agenda:
        return obj.agenda
    return str(obj)


@api_view(['GET'])
def recycle_bin_list(request):
    """List all soft-deleted items across all models."""
    items = []
    for model_label, display_name in RECYCLABLE_MODELS.items():
        try:
            Model = apps.get_model(model_label)
        except LookupError:
            continue

        deleted = Model.objects.filter(is_deleted=True).order_by('-deleted_at')
        for obj in deleted:
            # Prefer deleted_at; fall back to updated_at for legacy records
            # whose deleted_at was never populated. updated_at is touched by
            # soft_delete(), so it is a reliable proxy for the archive moment.
            anchor = obj.deleted_at or getattr(obj, 'updated_at', None)
            days_left = 30
            if anchor:
                days_left = max(0, 30 - (timezone.now() - anchor).days)

            # For communications, show specific type (Email, WhatsApp, Call, Note)
            item_type = display_name
            if model_label == 'communications.Communication' and hasattr(obj, 'comm_type'):
                type_map = {'email': 'Email', 'whatsapp': 'WhatsApp', 'call': 'Call', 'note': 'Note'}
                item_type = type_map.get(obj.comm_type, 'Activity')

            item_data = {
                'id': str(obj.id),
                'model': model_label,
                'type': item_type,
                'name': _get_display(obj, model_label),
                'deleted_at': (obj.deleted_at or getattr(obj, 'updated_at', None)).isoformat() if (obj.deleted_at or getattr(obj, 'updated_at', None)) else None,
                'days_left': days_left,
            }
            # Add extra info for communications
            if model_label == 'communications.Communication':
                item_data['classification'] = getattr(obj, 'classification', '')
                item_data['external_email'] = obj.external_email or ''
                item_data['direction'] = getattr(obj, 'direction', '')
            items.append(item_data)

    # Sort by deleted_at descending
    items.sort(key=lambda x: x['deleted_at'] or '', reverse=True)
    return Response(items)


@api_view(['POST'])
def recycle_bin_preview(request):
    """Preview a soft-deleted item's full data."""
    model_label = request.data.get('model')
    obj_id = request.data.get('id')

    if not model_label or not obj_id:
        return Response({'error': 'model and id are required'}, status=status.HTTP_400_BAD_REQUEST)
    if model_label not in RECYCLABLE_MODELS:
        return Response({'error': 'Invalid model'}, status=status.HTTP_400_BAD_REQUEST)

    Model = apps.get_model(model_label)
    try:
        obj = Model.objects.get(id=obj_id, is_deleted=True)
    except Model.DoesNotExist:
        return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)

    # Build preview data from model fields
    data = {}
    skip_fields = {'id', 'is_deleted', 'deleted_at', 'updated_at', 'password'}
    for field in obj._meta.get_fields():
        if not hasattr(field, 'attname') or field.attname in skip_fields:
            continue
        name = field.attname.replace('_id', '') if field.attname.endswith('_id') else field.attname
        val = getattr(obj, field.attname, None)
        if val is None or val == '':
            continue
        # Convert special types
        if hasattr(val, 'isoformat'):
            val = val.isoformat()
        elif isinstance(val, (int, float, bool, str)):
            pass
        else:
            val = str(val)
        data[name] = val

    # Add display name for FK fields
    if hasattr(obj, 'client') and obj.client:
        data['client_name'] = obj.client.company_name
    if hasattr(obj, 'user') and obj.user:
        data['user_name'] = obj.user.full_name

    data['_type'] = RECYCLABLE_MODELS[model_label]
    data['_name'] = _get_display(obj, model_label)
    return Response(data)


@api_view(['POST'])
def recycle_bin_restore(request):
    """Restore a soft-deleted item."""
    model_label = request.data.get('model')
    obj_id = request.data.get('id')

    if not model_label or not obj_id:
        return Response({'error': 'model and id are required'}, status=status.HTTP_400_BAD_REQUEST)

    if model_label not in RECYCLABLE_MODELS:
        return Response({'error': 'Invalid model'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        Model = apps.get_model(model_label)
        obj = Model.objects.get(id=obj_id, is_deleted=True)
        obj.restore()
        return Response({'status': 'restored', 'name': _get_display(obj, model_label)})
    except Model.DoesNotExist:
        return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
def recycle_bin_purge(request):
    """Permanently delete a soft-deleted item."""
    model_label = request.data.get('model')
    obj_id = request.data.get('id')

    if not model_label or not obj_id:
        return Response({'error': 'model and id are required'}, status=status.HTTP_400_BAD_REQUEST)

    if model_label not in RECYCLABLE_MODELS:
        return Response({'error': 'Invalid model'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        Model = apps.get_model(model_label)
        obj = Model.objects.get(id=obj_id, is_deleted=True)
        obj.delete()
        return Response({'status': 'permanently deleted'})
    except Model.DoesNotExist:
        return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['POST'])
def recycle_bin_empty(request):
    """Permanently delete ALL soft-deleted items."""
    if request.user.role not in ('admin', 'manager'):
        return Response({'error': 'Only admin/manager can empty recycle bin'}, status=status.HTTP_403_FORBIDDEN)

    total = 0
    for model_label in RECYCLABLE_MODELS:
        try:
            Model = apps.get_model(model_label)
            count, _ = Model.objects.filter(is_deleted=True).delete()
            total += count
        except Exception:
            pass
    return Response({'status': f'{total} items permanently deleted'})


def auto_purge_expired():
    """Delete items that have been in recycle bin for more than 30 days. Called by Celery."""
    cutoff = timezone.now() - timedelta(days=30)
    total = 0
    for model_label in RECYCLABLE_MODELS:
        try:
            Model = apps.get_model(model_label)
            count, _ = Model.objects.filter(is_deleted=True, deleted_at__lt=cutoff).delete()
            total += count
        except Exception:
            pass
    return total
