"""
Mirror OrderDocument-stored inspection photos into the Quality app's
Inspection / InspectionMedia tables so the Quality > Inspections page lists
each sales order's Passed / Failed photos separately.

The Sales Order page tags inspection photos with a name prefix:
  - "[Inspection Passed] <filename>"
  - "[Inspection Failed] <filename>"

This signal scans those names and keeps two synthetic Inspection rows per
order in sync (one Passed, one Failed) with their media links.
"""
import logging
import re
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

logger = logging.getLogger(__name__)

_INSPECTION_PASSED_RE = re.compile(r'^\s*\[\s*Inspection\s+Passed\s*\]', re.IGNORECASE)
_INSPECTION_FAILED_RE = re.compile(r'^\s*\[\s*Inspection\s+Failed\s*\]', re.IGNORECASE)


def _classify(name):
    if not name:
        return None
    if _INSPECTION_PASSED_RE.match(name):
        return 'passed'
    if _INSPECTION_FAILED_RE.match(name):
        return 'failed'
    return None


def _sync_order_inspection(order, status):
    """Idempotently maintain one Inspection row per (order, status), and
    refresh its media links from the matching OrderDocuments."""
    from .models import Inspection, InspectionMedia
    from orders.models import OrderDocument

    insp, _ = Inspection.objects.get_or_create(
        order=order,
        status=status,
        defaults={
            'inspection_type': Inspection.Type.PRE_DISPATCH,
            'inspection_date': None,
        },
    )
    # Wipe existing media rows for this synthetic inspection and rebuild
    # so renaming / deleting the underlying OrderDocument propagates.
    InspectionMedia.objects.filter(inspection=insp).delete()
    docs = OrderDocument.objects.filter(order=order, is_deleted=False)
    pat = _INSPECTION_PASSED_RE if status == Inspection.Status.PASSED else _INSPECTION_FAILED_RE
    for d in docs:
        if not pat.match(d.name or ''):
            continue
        if not d.file:
            continue
        InspectionMedia.objects.create(inspection=insp, file=d.file)
    # If we ended up with zero media, drop the empty Inspection.
    if not InspectionMedia.objects.filter(inspection=insp).exists():
        insp.delete()


def _sync_for_order(order):
    from .models import Inspection
    _sync_order_inspection(order, Inspection.Status.PASSED)
    _sync_order_inspection(order, Inspection.Status.FAILED)


def _coa_scope(name):
    """Decode the audience tag baked into the COA filename suffix.
    Returns 'client', 'logistic', or '' (= shared/both)."""
    n = (name or '').lower()
    if '_client.' in n or n.endswith('_client'):
        return 'client'
    if '_logistic.' in n or n.endswith('_logistic'):
        return 'logistic'
    return ''


def _sync_coa_for_doc(order_doc):
    """Mirror a COA-typed OrderDocument into the Quality app's COADocument
    table so Quality > COA Documents lists it. Idempotent — uses the
    OrderDocument FK as the unique key."""
    from .models import COADocument
    if order_doc.is_deleted or not order_doc.file:
        COADocument.objects.filter(order_document=order_doc).delete()
        return
    scope = _coa_scope(order_doc.name)
    coa_type = scope or 'lab'  # fallback to legacy 'lab' label
    COADocument.objects.update_or_create(
        order_document=order_doc,
        defaults={
            'order': order_doc.order,
            'name': order_doc.name or '',
            'file': order_doc.file,
            'coa_type': coa_type,
        },
    )


def _sync_msds_for_doc(order_doc):
    """Mirror MSDS-typed OrderDocument into the Quality app's MSDSDocument
    table so Quality > MSDS Documents lists it."""
    from .models import MSDSDocument
    if order_doc.is_deleted or not order_doc.file:
        MSDSDocument.objects.filter(order_document=order_doc).delete()
        return
    scope = _coa_scope(order_doc.name)  # same _Client / _Logistic suffix decoder
    msds_type = scope or 'lab'
    MSDSDocument.objects.update_or_create(
        order_document=order_doc,
        defaults={
            'order': order_doc.order,
            'name': order_doc.name or '',
            'file': order_doc.file,
            'msds_type': msds_type,
        },
    )


def _wire():
    """Lazy-wire so we don't trip the import order."""
    from orders.models import OrderDocument

    @receiver(post_save, sender=OrderDocument, dispatch_uid='quality.sync_inspection_save')
    def _on_doc_save(sender, instance, **kwargs):
        if not instance.order_id:
            return
        # Inspection-tagged photos -> Inspection records
        if _classify(instance.name):
            try:
                _sync_for_order(instance.order)
            except Exception as e:
                logger.warning(f'Inspection sync failed (save) for OrderDoc {instance.id}: {e}')
        # COA documents -> COADocument records
        if instance.doc_type == 'coa':
            try:
                _sync_coa_for_doc(instance)
            except Exception as e:
                logger.warning(f'COA sync failed (save) for OrderDoc {instance.id}: {e}')
        # MSDS documents -> MSDSDocument records
        if instance.doc_type == 'msds':
            try:
                _sync_msds_for_doc(instance)
            except Exception as e:
                logger.warning(f'MSDS sync failed (save) for OrderDoc {instance.id}: {e}')

    @receiver(post_delete, sender=OrderDocument, dispatch_uid='quality.sync_inspection_delete')
    def _on_doc_delete(sender, instance, **kwargs):
        if not instance.order_id:
            return
        if _classify(instance.name):
            try:
                _sync_for_order(instance.order)
            except Exception as e:
                logger.warning(f'Inspection sync failed (delete) for OrderDoc {instance.id}: {e}')
        if instance.doc_type == 'coa':
            try:
                from .models import COADocument
                COADocument.objects.filter(order_document=instance).delete()
            except Exception as e:
                logger.warning(f'COA sync failed (delete) for OrderDoc {instance.id}: {e}')
        if instance.doc_type == 'msds':
            try:
                from .models import MSDSDocument
                MSDSDocument.objects.filter(order_document=instance).delete()
            except Exception as e:
                logger.warning(f'MSDS sync failed (delete) for OrderDoc {instance.id}: {e}')


_wire()
