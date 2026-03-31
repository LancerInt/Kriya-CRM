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
    'clients.Client': 'Client',
    'clients.Contact': 'Contact',
    'communications.Communication': 'Communication',
    'quotations.Inquiry': 'Inquiry',
    'quotations.Quotation': 'Quotation',
    'orders.Order': 'Order',
    'shipments.Shipment': 'Shipment',
    'finance.Invoice': 'Invoice',
    'finance.Payment': 'Payment',
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
            days_left = 30
            if obj.deleted_at:
                days_left = max(0, 30 - (timezone.now() - obj.deleted_at).days)

            item_data = {
                'id': str(obj.id),
                'model': model_label,
                'type': display_name,
                'name': _get_display(obj, model_label),
                'deleted_at': obj.deleted_at.isoformat() if obj.deleted_at else None,
                'days_left': days_left,
            }
            # Add classification for communications so Archive shows category
            if model_label == 'communications.Communication' and hasattr(obj, 'classification'):
                item_data['classification'] = obj.classification
                item_data['external_email'] = obj.external_email or ''
            items.append(item_data)

    # Sort by deleted_at descending
    items.sort(key=lambda x: x['deleted_at'] or '', reverse=True)
    return Response(items)


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
