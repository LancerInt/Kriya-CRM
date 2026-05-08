from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from .models import Order, OrderDocument, OrderStatusHistory, WorkflowEventLog, EmailLog
from .serializers import (
    OrderSerializer, OrderDocumentSerializer, OrderStatusHistorySerializer,
    WorkflowEventSerializer, EmailLogSerializer,
)


from notifications.helpers import notify


def _renumber_live_orders():
    """Renumber every live (non-deleted) order to a contiguous ``ORD-NNNNN``
    sequence ordered by ``created_at`` ASC.

    Two passes inside a transaction so the unique constraint on
    ``order_number`` can't collide mid-update — first move every row to
    a guaranteed-unique temp value, then assign the final number.
    """
    from django.db import transaction
    with transaction.atomic():
        live = list(
            Order.objects.filter(is_deleted=False)
            .order_by('created_at', 'id')
            .only('id', 'order_number')
        )
        # Pass 1 — temporary unique values keyed off the row's UUID so
        # there's no chance of two rows sharing a temp number.
        for o in live:
            tmp = f'TMP-{str(o.id)[:8]}'
            if o.order_number != tmp:
                Order.objects.filter(pk=o.pk).update(order_number=tmp)
        # Pass 2 — final sequential ORD-NNNNN.
        for i, o in enumerate(live, start=1):
            final = f'ORD-{i:05d}'
            Order.objects.filter(pk=o.pk).update(order_number=final)


class OrderViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    filterset_fields = ['client', 'status']
    search_fields = ['order_number']

    def get_queryset(self):
        # Hide orders attached to auto-created placeholder clients (e.g.
        # "mailer-daemon (Auto-created)") so they don't pollute the Sales
        # Orders list. These rows are kept in the DB but excluded from
        # the API surface — they appear in Archive if explicitly needed.
        return (Order.objects
                .filter(is_deleted=False)
                .exclude(client__company_name__icontains='(Auto-created)')
                .select_related('client', 'created_by', 'quotation')
                .prefetch_related('items'))

    def perform_create(self, serializer):
        # Auto-generate the next ORD-NNNNN number. With auto-renumbering on
        # delete, the live set is always contiguous, so the next number is
        # simply (count of live orders) + 1. We still walk forward defensively
        # in case of a race during renumber.
        next_n = Order.objects.filter(is_deleted=False).count() + 1
        while Order.objects.filter(order_number=f'ORD-{next_n:05d}').exists():
            next_n += 1
        order_number = f'ORD-{next_n:05d}'

        order = serializer.save(created_by=self.request.user, order_number=order_number)
        notify(
            title=f'New order: {order.order_number}',
            message=f'{self.request.user.full_name} created order for {order.client.company_name}.',
            notification_type='system', link='/sales-orders',
            actor=self.request.user, client=order.client,
        )

    def perform_destroy(self, instance):
        """Soft-delete the order, then renumber the remaining live orders so
        the sequence stays contiguous (ORD-00018 → 00017 → ... → 00014 etc).

        Step 1 — release the deleted order's number by prefixing it with
        ``DEL-`` so the live ORD-NNNNN slot opens up.
        Step 2 — renumber every live order to a contiguous sequence.
        """
        from django.db import transaction
        with transaction.atomic():
            old_number = instance.order_number
            instance.soft_delete()
            # Free the slot. Truncate so we don't blow past max_length=50.
            freed = f'DEL-{str(instance.id)[:8]}-{(old_number or "")[:30]}'
            Order.objects.filter(pk=instance.pk).update(order_number=freed)
            _renumber_live_orders()

    @action(detail=True, methods=['post'], url_path='add-item')
    def add_item(self, request, pk=None):
        """Add a line item to an order."""
        from .models import OrderItem
        from .serializers import OrderItemSerializer
        order = self.get_object()
        item = OrderItem.objects.create(
            order=order,
            product_name=request.data.get('product_name', ''),
            client_product_name=request.data.get('client_product_name', ''),
            description=request.data.get('description', ''),
            quantity=request.data.get('quantity', 1),
            unit=request.data.get('unit', 'KG'),
            unit_price=request.data.get('unit_price', 0),
        )
        return Response(OrderItemSerializer(item).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='update-item')
    def update_item(self, request, pk=None):
        """Patch fields on an existing OrderItem. Body: {item_id, ...fields}.
        Saves through OrderItem.save() so total_price recomputes from
        quantity * unit_price, and the OrderItem post_save signal mirrors
        the change into PurchaseHistory + the order.total."""
        from .models import OrderItem
        from .serializers import OrderItemSerializer
        order = self.get_object()
        item_id = request.data.get('item_id')
        if not item_id:
            return Response({'error': 'item_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            item = OrderItem.objects.get(id=item_id, order=order)
        except OrderItem.DoesNotExist:
            return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)
        for f in ('product_name', 'client_product_name', 'description', 'quantity', 'unit', 'unit_price'):
            if f in request.data:
                setattr(item, f, request.data[f])
        item.save()
        return Response(OrderItemSerializer(item).data)

    @action(detail=True, methods=['post'], url_path='delete-item')
    def delete_item(self, request, pk=None):
        """Remove an OrderItem. Body: {item_id}. The OrderItem signal
        recomputes order.total automatically once the row is gone."""
        from .models import OrderItem
        order = self.get_object()
        item_id = request.data.get('item_id')
        if not item_id:
            return Response({'error': 'item_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        deleted, _ = OrderItem.objects.filter(id=item_id, order=order).delete()
        if not deleted:
            return Response({'error': 'Item not found'}, status=status.HTTP_404_NOT_FOUND)
        # Force-recompute total in case the OrderItem signal handled it via
        # .update() (no in-memory order refresh needed for the response).
        return Response({'status': 'deleted', 'item_id': str(item_id)})

    @action(detail=True, methods=['post'], url_path='add-feedback')
    def add_feedback(self, request, pk=None):
        """Add client feedback to an order."""
        from .models import OrderFeedback
        order = self.get_object()
        feedback, created = OrderFeedback.objects.get_or_create(order=order)
        feedback.comments = request.data.get('comments', feedback.comments)
        feedback.issues = request.data.get('issues', feedback.issues)
        feedback.bulk_order_interest = request.data.get('bulk_order_interest', feedback.bulk_order_interest)
        feedback.save()
        return Response({'status': 'saved'}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='set-coa-msds-split')
    def set_coa_msds_split(self, request, pk=None):
        """Toggle whether COA/MSDS are required separately for Client and
        Logistic. Body: {separate: bool}. When True, each product needs
        a Client-tagged AND a Logistic-tagged copy of COA + MSDS.

        Toggle transitions wipe the COA/MSDS files that no longer fit the
        new mode so the user always starts fresh:
          * False → True (Same → Separate): remove SHARED docs (no
            _Client / _Logistic suffix). The user must regenerate two
            scoped copies per product.
          * True → False (Separate → Same): remove SCOPED docs (with
            _Client or _Logistic suffix). The user must regenerate one
            shared copy per product.

        Only COA and MSDS are touched — every other document type is
        left alone. Soft-delete cascades through the Quality signals so
        the Finance > Quality COA / MSDS tabs reflect the change too.
        """
        order = self.get_object()
        flag = bool(request.data.get('separate'))
        was_split = order.separate_coa_msds_per_group
        order.separate_coa_msds_per_group = flag
        order.save(update_fields=['separate_coa_msds_per_group'])

        from django.db.models import Q
        from .models import OrderDocument

        scoped_filter = (
            Q(name__iregex=r'_(Client|Logistic)\.[A-Za-z0-9]+$')
            | Q(name__iregex=r'_(Client|Logistic)$')
        )

        deleted = 0
        if was_split == flag:
            # No transition; nothing to clean.
            target = OrderDocument.objects.none()
        elif was_split and not flag:
            # Separate → Same. Remove all scoped (Client/Logistic) docs.
            target = OrderDocument.objects.filter(
                order=order, doc_type__in=['coa', 'msds'], is_deleted=False,
            ).filter(scoped_filter)
        else:
            # Same → Separate. Remove all SHARED docs (those that have
            # neither a _Client nor _Logistic suffix in their filename).
            target = OrderDocument.objects.filter(
                order=order, doc_type__in=['coa', 'msds'], is_deleted=False,
            ).exclude(scoped_filter)

        deleted = target.count()
        for doc in target:
            if hasattr(doc, 'soft_delete'):
                doc.soft_delete()
            else:
                doc.delete()

        return Response({
            'separate_coa_msds_per_group': order.separate_coa_msds_per_group,
            'docs_removed': deleted,
        })

    @action(detail=True, methods=['post'], url_path='set-payment-phase')
    def set_payment_phase(self, request, pk=None):
        """Toggle whether the advance or balance payment is required
        Before or After Dispatch. Body: {which: 'advance'|'balance',
        is_before_dispatch: bool}. Drives the dispatch gate."""
        order = self.get_object()
        which = request.data.get('which')
        flag = bool(request.data.get('is_before_dispatch'))
        if which == 'advance':
            order.advance_is_before_dispatch = flag
            order.save(update_fields=['advance_is_before_dispatch'])
        elif which == 'balance':
            order.balance_is_before_dispatch = flag
            order.save(update_fields=['balance_is_before_dispatch'])
        else:
            return Response(
                {'error': "which must be 'advance' or 'balance'"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({
            'advance_is_before_dispatch': order.advance_is_before_dispatch,
            'balance_is_before_dispatch': order.balance_is_before_dispatch,
        })

    @action(detail=True, methods=['post'], url_path='mark-advance-payment')
    def mark_advance_payment(self, request, pk=None):
        """Mark or unmark the advance portion of the payment as received.
        Required before dispatch when the order's payment_terms call for an
        advance (e.g. "50% advance D/A 60 days")."""
        from django.utils import timezone
        order = self.get_object()
        received = request.data.get('received')
        if received is None:
            received = order.advance_payment_received_at is None
        order.advance_payment_received_at = timezone.now() if received else None
        order.save(update_fields=['advance_payment_received_at'])
        return Response({'advance_payment_received_at': order.advance_payment_received_at})

    @action(detail=True, methods=['post'], url_path='mark-balance-payment')
    def mark_balance_payment(self, request, pk=None):
        """Mark or unmark the balance portion (e.g. D/A 60 days after
        dispatch) as received. Clears the pending balance reminder."""
        from django.utils import timezone
        order = self.get_object()
        received = request.data.get('received')
        if received is None:
            received = order.balance_payment_received_at is None
        order.balance_payment_received_at = timezone.now() if received else None
        # Reset the reminder slot so a future toggle-back-off followed by a
        # new due date can re-arm the 10-day nudge.
        if received:
            order.balance_reminder_sent_at = None
        order.save(update_fields=['balance_payment_received_at', 'balance_reminder_sent_at'])
        return Response({'balance_payment_received_at': order.balance_payment_received_at})

    @action(detail=True, methods=['post'], url_path='mark-firc')
    def mark_firc(self, request, pk=None):
        """Mark or unmark the FIRC (Foreign Inward Remittance Certificate) as
        received. This is the 11th and final step in the order lifecycle and
        drives the shipment progress to 100%."""
        from django.utils import timezone
        order = self.get_object()
        received = request.data.get('received')
        if received is None:
            received = order.firc_received_at is None
        order.firc_received_at = timezone.now() if received else None
        order.save(update_fields=['firc_received_at'])
        return Response({'firc_received_at': order.firc_received_at})

    # ── Status Transition ──
    # ── Container Booked: capture shipment fields + transition + sync shipment ──
    @action(detail=True, methods=['post'], url_path='container-booked')
    def container_booked(self, request, pk=None):
        """Move order -> Container Booked while persisting the shipping-detail
        fields (container/BL/vessel/forwarder/CHA/dates/etc.) onto the linked
        Shipment record. The shipment's status is also updated to
        'container_booked' so the shipment workflow stays in sync.
        """
        from shipments.models import Shipment
        from .workflow_service import transition_order, WorkflowError

        order = self.get_object()
        data = request.data or {}

        # Editable shipment fields the popup collects
        SHIPMENT_FIELDS = (
            'container_number', 'bl_number', 'vessel_name',
            'forwarder', 'cha', 'shipping_line',
            'port_of_loading', 'port_of_discharge',
            'container_booking_date', 'dispatch_date',
            'transit_days', 'estimated_arrival',
        )

        # Find or auto-create the shipment for this order
        shipment = Shipment.objects.filter(order=order).order_by('-created_at').first()
        if not shipment:
            count = Shipment.objects.count() + 1
            sn = f'SHP-{count:05d}'
            while Shipment.objects.filter(shipment_number=sn).exists():
                count += 1
                sn = f'SHP-{count:05d}'
            shipment = Shipment.objects.create(
                shipment_number=sn, order=order, client=order.client,
                status='pending',
                delivery_terms=order.delivery_terms or '',
                freight_type=order.freight_terms or '',
                country=getattr(order.client, 'country', '') or '',
            )

        update_fields = []
        for field in SHIPMENT_FIELDS:
            if field in data and data[field] not in (None, ''):
                value = data[field]
                if field == 'transit_days':
                    try: value = int(value)
                    except (TypeError, ValueError): continue
                setattr(shipment, field, value)
                update_fields.append(field)

        if shipment.status != 'container_booked':
            shipment.status = 'container_booked'
            update_fields.append('status')

        if update_fields:
            shipment.save(update_fields=list(set(update_fields)))

        # Now transition the order itself
        try:
            order = transition_order(
                order, 'container_booked', request.user,
                remarks=data.get('remarks', '') or 'Shipment details captured at Container Booked',
            )
        except WorkflowError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        notify(
            title=f'Order {order.order_number} → Container Booked',
            message=f'{request.user.full_name} captured shipment details and moved order to Container Booked.',
            notification_type='system', link='/sales-orders',
            actor=request.user, client=order.client,
            extra_users=[order.created_by] if order.created_by else [],
        )
        return Response({
            'order': OrderSerializer(order, context={'request': request}).data,
            'shipment_id': str(shipment.id),
            'shipment_number': shipment.shipment_number,
        })

    @action(detail=True, methods=['post'], url_path='transition')
    def transition(self, request, pk=None):
        """Move order to next status via workflow engine."""
        order = self.get_object()
        new_status = request.data.get('status')
        remarks = request.data.get('remarks', '')

        if not new_status:
            return Response({'error': 'Status is required'}, status=status.HTTP_400_BAD_REQUEST)

        from .workflow_service import transition_order, WorkflowError
        try:
            order = transition_order(order, new_status, request.user, remarks)
            notify(
                title=f'Order {order.order_number} → {new_status.replace("_", " ").title()}',
                message=f'{request.user.full_name} updated order status to {new_status.replace("_", " ")}.',
                notification_type='system', link='/sales-orders',
                actor=request.user, client=order.client,
                extra_users=[order.created_by] if order.created_by else [],
            )
            return Response(OrderSerializer(order).data)
        except WorkflowError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Revert Status ──
    @action(detail=True, methods=['post'], url_path='revert')
    def revert(self, request, pk=None):
        """Revert order to previous status (admin/manager only)."""
        order = self.get_object()
        remarks = request.data.get('remarks', '')
        from .workflow_service import revert_order, WorkflowError
        try:
            order = revert_order(order, request.user, remarks)
            notify(
                title=f'Order {order.order_number} reverted to {order.status.replace("_", " ").title()}',
                message=f'{request.user.full_name} reverted the order status.',
                notification_type='alert', link='/sales-orders',
                actor=request.user, client=order.client,
                extra_users=[order.created_by] if order.created_by else [],
            )
            return Response(OrderSerializer(order).data)
        except WorkflowError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # ── Timeline ──
    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        """Get visual timeline of order statuses."""
        order = self.get_object()
        from .workflow_service import get_order_timeline
        return Response(get_order_timeline(order))

    # ── Status History (audit log) ──
    @action(detail=True, methods=['get'], url_path='status-history')
    def status_history(self, request, pk=None):
        order = self.get_object()
        history = order.status_history.select_related('changed_by').all()
        return Response(OrderStatusHistorySerializer(history, many=True).data)

    # ── Workflow Events ──
    @action(detail=True, methods=['get', 'post'])
    def events(self, request, pk=None):
        order = self.get_object()
        if request.method == 'POST':
            metadata = {}
            files = request.FILES.getlist('attachments')
            if not files:
                single = request.FILES.get('attachment')
                if single:
                    files = [single]
            kinds = request.data.getlist('attachment_kinds') if hasattr(request.data, 'getlist') else []
            if not kinds:
                k = request.data.get('attachment_kind')
                if k:
                    kinds = [k]
            name_prefix = (request.data.get('name_prefix') or '').strip()
            attachments = []
            for idx, f in enumerate(files):
                kind = kinds[idx] if idx < len(kinds) else 'file'
                stored_name = f'{name_prefix}{f.name}' if name_prefix else f.name
                doc = OrderDocument.objects.create(
                    order=order,
                    doc_type='note_attachment',
                    name=stored_name,
                    file=f,
                    uploaded_by=request.user,
                )
                attachments.append({
                    'id': str(doc.id),
                    'url': doc.file.url,
                    'name': doc.name,
                    'kind': kind,
                })
            existing_ids = request.data.getlist('existing_attachments') if hasattr(request.data, 'getlist') else []
            for raw_id in existing_ids:
                try:
                    doc = OrderDocument.objects.get(id=raw_id, order=order)
                except (OrderDocument.DoesNotExist, ValueError):
                    continue
                ext = (doc.name or '').split('.')[-1].lower()
                if ext in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'):
                    kind = 'image'
                elif ext in ('mp3', 'wav', 'ogg', 'webm', 'm4a'):
                    kind = 'voice'
                else:
                    kind = 'file'
                attachments.append({
                    'id': str(doc.id),
                    'url': doc.file.url,
                    'name': doc.name,
                    'kind': kind,
                })
            library_ids = request.data.getlist('library_documents') if hasattr(request.data, 'getlist') else []
            if library_ids:
                from documents.models import Document as LibraryDocument
                for raw_id in library_ids:
                    try:
                        ldoc = LibraryDocument.objects.get(id=raw_id)
                    except (LibraryDocument.DoesNotExist, ValueError):
                        continue
                    ext = (ldoc.filename or ldoc.name or '').split('.')[-1].lower()
                    if ext in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'):
                        kind = 'image'
                    elif ext in ('mp3', 'wav', 'ogg', 'webm', 'm4a'):
                        kind = 'voice'
                    else:
                        kind = 'file'
                    attachments.append({
                        'library_id': str(ldoc.id),
                        'url': ldoc.file.url,
                        'name': ldoc.name or ldoc.filename,
                        'kind': kind,
                    })
            if attachments:
                metadata = {'attachments': attachments}
            event = WorkflowEventLog.objects.create(
                order=order,
                event_type=request.data.get('event_type', 'note'),
                description=request.data.get('description', ''),
                metadata=metadata,
                triggered_by=request.user,
            )
            return Response(WorkflowEventSerializer(event).data, status=status.HTTP_201_CREATED)
        events = order.events.select_related('triggered_by').all()
        return Response(WorkflowEventSerializer(events, many=True).data)

    @action(detail=True, methods=['patch'], url_path='events/(?P<event_id>[^/.]+)')
    def update_event(self, request, pk=None, event_id=None):
        """Update a workflow event (note)."""
        order = self.get_object()
        try:
            event = WorkflowEventLog.objects.get(id=event_id, order=order)
            if 'description' in request.data:
                event.description = request.data['description']
                event.save(update_fields=['description'])
            return Response(WorkflowEventSerializer(event).data)
        except WorkflowEventLog.DoesNotExist:
            return Response({'error': 'Event not found'}, status=status.HTTP_404_NOT_FOUND)

    # ── Email Logs ──
    @action(detail=True, methods=['get'], url_path='email-logs')
    def email_logs(self, request, pk=None):
        order = self.get_object()
        logs = order.email_logs.all()
        return Response(EmailLogSerializer(logs, many=True).data)

    # ── Upload PO ──
    @action(detail=True, methods=['post'], url_path='upload-po')
    def upload_po(self, request, pk=None):
        order = self.get_object()
        po_file = request.FILES.get('po_document')
        po_number = request.data.get('po_number', '')

        if not po_file:
            return Response({'error': 'PO document is required'}, status=status.HTTP_400_BAD_REQUEST)

        order.po_document = po_file
        order.po_number = po_number
        order.save(update_fields=['po_document', 'po_number'])

        # Also create OrderDocument record
        OrderDocument.objects.create(
            order=order, doc_type='po', name=po_file.name,
            file=po_file, uploaded_by=request.user,
        )

        # Log event
        WorkflowEventLog.objects.create(
            order=order, event_type='doc_uploaded',
            description=f'PO document uploaded: {po_file.name}',
            metadata={'filename': po_file.name, 'po_number': po_number},
            triggered_by=request.user,
        )

        notify(
            title=f'PO uploaded for {order.order_number}',
            message=f'{request.user.full_name} uploaded purchase order document.',
            notification_type='system', link='/sales-orders',
            actor=request.user, client=order.client,
            extra_users=[order.created_by] if order.created_by else [],
        )
        return Response({'status': 'PO uploaded', 'po_number': po_number})

    @action(detail=True, methods=['get'])
    def documents(self, request, pk=None):
        """List all documents for this order."""
        order = self.get_object()
        docs = order.order_documents.select_related('uploaded_by').filter(is_deleted=False)
        return Response(OrderDocumentSerializer(docs, many=True).data)

    @action(detail=True, methods=['post'], url_path='delete-document')
    def delete_document(self, request, pk=None):
        """Soft-delete a document from this order and log it in the status
        history. The file is kept on disk so it can be restored via the
        undo/restore action on the history timeline."""
        from django.utils import timezone as tz
        order = self.get_object()
        doc_id = request.data.get('doc_id')
        if not doc_id:
            return Response({'error': 'doc_id required'}, status=status.HTTP_400_BAD_REQUEST)
        doc = OrderDocument.objects.filter(order=order, id=doc_id, is_deleted=False).first()
        if not doc:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)
        doc_name = doc.name or (doc.file.name if doc.file else 'Unknown')
        doc_type = doc.doc_type or 'other'
        # Soft-delete — file stays on disk for restoration
        doc.is_deleted = True
        doc.deleted_by = request.user
        doc.deleted_at = tz.now()
        doc.save(update_fields=['is_deleted', 'deleted_by', 'deleted_at'])
        # Audit trail with the doc ID so restore can find it
        OrderStatusHistory.objects.create(
            order=order,
            from_status='document_deleted',
            to_status=order.status,
            changed_by=request.user,
            remarks=f'Deleted document: "{doc_name}" (type: {doc_type}) [doc_id:{doc.id}]',
        )
        return Response({'status': 'deleted', 'doc_id': doc.id})

    @action(detail=True, methods=['post'], url_path='restore-document')
    def restore_document(self, request, pk=None):
        """Restore a previously soft-deleted document. Accepts either doc_id
        or doc_name as a fallback for older deletion entries that didn't store
        the doc_id in the audit trail."""
        order = self.get_object()
        doc_id = request.data.get('doc_id')
        doc_name = request.data.get('doc_name')
        doc = None
        if doc_id:
            doc = OrderDocument.objects.filter(order=order, id=doc_id, is_deleted=True).first()
        elif doc_name:
            doc = OrderDocument.objects.filter(order=order, name=doc_name, is_deleted=True).order_by('-deleted_at').first()
        if not doc:
            return Response({'error': 'Document not found or already restored'}, status=status.HTTP_404_NOT_FOUND)
        doc.is_deleted = False
        doc.deleted_by = None
        doc.deleted_at = None
        doc.save(update_fields=['is_deleted', 'deleted_by', 'deleted_at'])
        OrderStatusHistory.objects.create(
            order=order,
            from_status='document_restored',
            to_status=order.status,
            changed_by=request.user,
            remarks=f'Restored document: "{doc.name}" (type: {doc.doc_type})',
        )
        return Response({'status': 'restored'})

    # ── Upload Document ──
    @action(detail=True, methods=['post'], url_path='upload-document')
    def upload_document(self, request, pk=None):
        order = self.get_object()
        doc_file = request.FILES.get('file')
        doc_type = request.data.get('doc_type', 'other')
        name = request.data.get('name', doc_file.name if doc_file else '')
        order_item_id = request.data.get('order_item_id')

        if not doc_file:
            return Response({'error': 'File is required'}, status=status.HTTP_400_BAD_REQUEST)

        order_item = None
        if order_item_id:
            try:
                order_item = order.items.get(id=order_item_id)
            except Exception:
                order_item = None

        doc = OrderDocument.objects.create(
            order=order, order_item=order_item, doc_type=doc_type, name=name,
            file=doc_file, uploaded_by=request.user,
        )

        WorkflowEventLog.objects.create(
            order=order, event_type='doc_uploaded',
            description=f'Document uploaded: {name} ({doc_type})',
            metadata={'filename': name, 'doc_type': doc_type},
            triggered_by=request.user,
        )

        # If a BL document is uploaded together with its number, sync the
        # number to the linked Shipment so the Shipments page shows it.
        bl_number = (request.data.get('bl_number') or '').strip()
        if doc_type == 'bl' and bl_number:
            try:
                from orders.workflow_service import sync_shipment_from_order
                sync_shipment_from_order(order, bl_number=bl_number)
            except Exception:
                pass

        return Response(OrderDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    # ── Dispatch mail draft ──
    @action(detail=True, methods=['post'], url_path='dispatch-mail-draft')
    def dispatch_mail_draft(self, request, pk=None):
        """Build the dispatch email draft when leaving Documents Approved.

        Steps:
        1. Verify Insurance is uploaded (workflow gate also enforces this).
        2. Save the estimated delivery time as a Note for posterity.
        3. Find/Resolve the source email thread for this order's client.
        4. Create an EmailDraft with attachments: Client Invoice, Client Packing
           List, COA, MSDS, Insurance, and any image OrderDocument uploaded
           while the order was at status='inspection' (factory stuffing photos).
        5. Return the draft_id + communication_id so the frontend can navigate.

        The transition to 'dispatched' is performed by this endpoint after the
        draft is created — the user can review/send the email from the draft
        page; the order has already moved on.
        """
        from communications.models import Communication, EmailDraft, DraftAttachment
        from django.core.files.base import ContentFile
        order = self.get_object()

        # 1. Insurance gate
        if not OrderDocument.objects.filter(order=order, doc_type='insurance', is_deleted=False).exists():
            return Response({'error': 'Upload Insurance document first.'}, status=status.HTTP_400_BAD_REQUEST)

        # 2. Before-dispatch payment gate — every payment row the executive
        # has categorized as "Before Dispatch" must be ticked first.
        from .payment_terms import before_dispatch_outstanding, parse_payment_terms
        if before_dispatch_outstanding(order):
            parsed = parse_payment_terms(order.payment_terms)
            outstanding = []
            if parsed['has_advance'] and order.advance_is_before_dispatch and not order.advance_payment_received_at:
                outstanding.append(f'Advance ({parsed["advance_pct"]}%)')
            if parsed['has_balance'] and order.balance_is_before_dispatch and not order.balance_payment_received_at:
                outstanding.append(f'Balance ({parsed["balance_pct"]}%)')
            return Response(
                {'error': f'Tick the following payment(s) marked as Before Dispatch before sending the dispatch email: {", ".join(outstanding)}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        delivery_time = (request.data.get('estimated_delivery_time') or '').strip()
        # 2. Save delivery time as a Note (best-effort)
        if delivery_time:
            try:
                WorkflowEventLog.objects.create(
                    order=order, event_type='note',
                    description=f'Estimated Delivery: {delivery_time}',
                    metadata={'kind': 'estimated_delivery', 'value': delivery_time},
                    triggered_by=request.user,
                )
            except Exception:
                pass

        # 3. Find the right email thread for this order in priority order:
        #    a) order.source_communication (anchored at order creation)
        #    b) Any PI for this order whose source_communication is set
        #    c) Inbound email mentioning a product from this order
        #    d) Inbound email mentioning the order number
        #    e) Fallback: most recent inbound from the client
        from django.db.models import Q
        from finance.models import ProformaInvoice
        comm = None
        if order.source_communication_id:
            comm = Communication.objects.filter(id=order.source_communication_id, is_deleted=False).first()
        if not comm:
            pi_with_src = ProformaInvoice.objects.filter(
                order=order, source_communication__isnull=False,
            ).order_by('-created_at').first()
            if pi_with_src and pi_with_src.source_communication_id:
                comm = Communication.objects.filter(id=pi_with_src.source_communication_id, is_deleted=False).first()
        if not comm:
            product_names = [it.product_name for it in order.items.all() if it.product_name]
            if product_names:
                product_q = Q()
                for name in product_names:
                    product_q |= Q(subject__icontains=name) | Q(body__icontains=name)
                comm = Communication.objects.filter(
                    client=order.client, comm_type='email', direction='inbound', is_deleted=False,
                ).filter(product_q).order_by('-created_at').first()
        if not comm and order.order_number:
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', is_deleted=False,
            ).filter(Q(subject__icontains=order.order_number) | Q(body__icontains=order.order_number)).order_by('-created_at').first()
        if not comm:
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', direction='inbound', is_deleted=False,
            ).order_by('-created_at').first()
        if not comm:
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', is_deleted=False,
            ).order_by('-created_at').first()

        # If we resolved a thread but the order didn't have one anchored,
        # stamp it now so subsequent stages (transit, delivery, FIRC) reuse
        # the same thread without re-running the heuristics.
        if comm and not order.source_communication_id:
            try:
                order.source_communication = comm
                order.save(update_fields=['source_communication'])
            except Exception:
                pass

        # 4. Build draft body
        product_lines = ', '.join([(it.product_name or '') for it in order.items.all() if it.product_name])
        client_name = order.client.company_name if order.client else 'Valued Customer'
        delivery_html = f'<p><strong>Estimated Delivery:</strong> {delivery_time}</p>' if delivery_time else ''
        ai_subject = f'Re: {comm.subject}' if comm and comm.subject else 'Shipment Dispatch Update'
        ai_body = (
            f'<p>Dear {client_name},</p>'
            f'<p>We are pleased to inform you that the following products from our factory '
            f'are now being dispatched as part of your order:</p>'
            f'<p><strong>{product_lines or "—"}</strong></p>'
            f'{delivery_html}'
            f'<p>Please find attached the supporting documents for your reference: '
            f'Client Invoice, Client Packing List, COA, MSDS, and the factory stuffing photos.</p>'
            f'<p>Please do not hesitate to reach out if you require any further information.</p>'
            f'<p>Best regards,<br/>{getattr(request.user, "full_name", "") or request.user.username}</p>'
        )

        # Resolve a recipient address
        to_email = ''
        if comm and getattr(comm, 'external_email', ''):
            to_email = comm.external_email
        if not to_email:
            from clients.models import Contact
            primary = Contact.objects.filter(client=order.client, is_primary=True).first() \
                or Contact.objects.filter(client=order.client).first()
            if primary and primary.email:
                to_email = primary.email

        # Create / reuse the draft. Only reuse a draft we previously stamped
        # for this order's dispatch — otherwise an unrelated draft (e.g. a
        # bounce-reply) on the same comm would get hijacked.
        draft = None
        if comm:
            for cand in EmailDraft.objects.filter(communication=comm, status='draft').order_by('-updated_at'):
                actions = (cand.editor_data or {}).get('auto_actions') or []
                if any(a.get('type') == 'order_transition' and a.get('order_id') == str(order.id) and a.get('to_status') == 'dispatched' for a in actions):
                    draft = cand
                    break
        if not draft:
            draft = EmailDraft.objects.create(
                communication=comm,
                to_email=to_email or '',
                subject=ai_subject,
                body=ai_body,
                cc='', status='draft',
                created_by=request.user, edited_by=request.user,
            )
        # Always overwrite to/subject/body so the dispatch content is what the
        # user reviews, not stale text from a prior session.
        update_fields = ['to_email', 'subject', 'body', 'edited_by']
        draft.to_email = to_email or draft.to_email
        draft.subject = ai_subject
        draft.body = ai_body
        draft.edited_by = request.user
        draft.save(update_fields=update_fields)

        # Stamp explicit auto-action so the post-send hook can transition the
        # order regardless of attachment filenames.
        ed = dict(draft.editor_data or {})
        actions = list(ed.get('auto_actions') or [])
        actions = [a for a in actions if not (a.get('type') == 'order_transition' and a.get('order_id') == str(order.id))]
        actions.append({'type': 'order_transition', 'order_id': str(order.id), 'to_status': 'dispatched', 'from_status': 'docs_approved'})
        ed['auto_actions'] = actions
        draft.editor_data = ed
        draft.save(update_fields=['editor_data'])

        # 5. Attach the dispatch documents — clear any old auto-attached docs
        # with our well-known prefixes so re-running cleanly replaces them.
        DISPATCH_FILENAME_PREFIXES = (
            'Client_Invoice_', 'Client_Packing_List_', 'COA_', 'MSDS_',
            'Insurance_', 'Factory_Stuffing_',
            # Legacy prefix from earlier implementation
            'Dispatch_',
        )
        for prefix in DISPATCH_FILENAME_PREFIXES:
            DraftAttachment.objects.filter(draft=draft, filename__startswith=prefix).delete()

        order_no = order.order_number or 'order'
        photo_counter = {'n': 0}

        def _attach_doc(doc, filename):
            if not doc or not doc.file:
                return
            try:
                doc.file.open('rb')
                content = doc.file.read()
                doc.file.close()
            except Exception:
                return
            att = DraftAttachment(draft=draft, filename=filename, file_size=len(content))
            att.file.save(filename, ContentFile(content), save=True)

        def _ext_of(doc):
            return (doc.name or doc.file.name or 'pdf').rsplit('.', 1)[-1].lower() or 'pdf'

        # Single-doc attachments (one document on the order). Filenames
        # are short and order-id-free so the client only sees the document
        # type — they don't need the internal order number on the file.
        for doc_type, label in [
            ('client_invoice', 'Client_Invoice'),
            ('client_packing_list', 'Client_Packing_List'),
        ]:
            doc = OrderDocument.objects.filter(order=order, doc_type=doc_type, is_deleted=False).order_by('-created_at').first()
            if doc:
                _attach_doc(doc, f'{label}.{_ext_of(doc)}')

        # Per-product attachments — one COA and one MSDS for every OrderItem.
        # If an item has its own linked doc that's used; otherwise the
        # order-level fallback (no order_item) is attached. Filenames are
        # de-duplicated by sanitizing the product name.
        def _safe(name):
            import re
            return re.sub(r'[^A-Za-z0-9_-]+', '_', (name or 'Product')).strip('_') or 'Product'

        order_level_seen = {'coa': False, 'msds': False}
        for doc_type, label in [('coa', 'COA'), ('msds', 'MSDS')]:
            for item in order.items.all():
                doc = OrderDocument.objects.filter(
                    order=order, order_item=item, doc_type=doc_type, is_deleted=False,
                ).order_by('-created_at').first()
                if not doc:
                    # Fall back to an order-level (unlinked) doc — but attach it
                    # only once if there are multiple items.
                    if order_level_seen[doc_type]:
                        continue
                    doc = OrderDocument.objects.filter(
                        order=order, order_item__isnull=True, doc_type=doc_type, is_deleted=False,
                    ).order_by('-created_at').first()
                    if doc:
                        order_level_seen[doc_type] = True
                if doc:
                    fname = f'{label}_{_safe(item.product_name)}.{_ext_of(doc)}'
                    _attach_doc(doc, fname)

        # Factory stuffing photos: any image OrderDocument uploaded between
        # inspection_at and inspection_passed_at.
        if order.inspection_at:
            from django.utils import timezone as _tz
            window_end = order.inspection_passed_at or _tz.now()
            photos = OrderDocument.objects.filter(
                order=order, is_deleted=False,
                created_at__gte=order.inspection_at, created_at__lte=window_end,
            )
            for photo in photos:
                fname = (photo.name or '').lower()
                if any(fname.endswith(ext) for ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif')):
                    photo_counter['n'] += 1
                    _attach_doc(photo, f'Factory_Stuffing_{photo_counter["n"]}.{_ext_of(photo)}')

        # NOTE: Order is intentionally NOT transitioned here. The transition
        # to 'dispatched' happens only after the email is actually sent — see
        # the post-send hook in communications.views.EmailDraftViewSet.send.

        return Response({
            'draft_id': str(draft.id),
            'communication_id': str(comm.id) if comm else None,
            'status': order.status,
        })

    # ── Transit mail draft ──
    @action(detail=True, methods=['post'], url_path='transit-mail-draft')
    def transit_mail_draft(self, request, pk=None):
        """Build the In-Transit email draft when leaving Dispatched.

        Requires BL + Shipping Bill + Schedule List + COO. Re-uses the same
        email thread as the dispatch flow (PI source -> product match -> order
        number match -> latest inbound). Attaches ONLY the BL. The transition
        to 'in_transit' fires when the draft is actually sent (post-send hook).
        """
        from communications.models import Communication, EmailDraft, DraftAttachment
        from django.core.files.base import ContentFile
        from django.db.models import Q
        from orders.workflow_service import _missing_transit_docs

        order = self.get_object()

        # 1. Verify all 4 transit docs are present
        missing = _missing_transit_docs(order)
        if missing:
            label_map = {
                'bl': 'Bill of Lading',
                'shipping_bill': 'Shipping Bill',
                'schedule_list': 'Schedule List',
                'coo': 'Certificate of Origin',
            }
            return Response(
                {'error': 'Missing required transit documents.',
                 'missing': [label_map.get(m, m) for m in missing]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Same thread-resolution algorithm as dispatch — prefer the order's
        # anchored source communication first.
        from finance.models import ProformaInvoice
        comm = None
        if order.source_communication_id:
            comm = Communication.objects.filter(id=order.source_communication_id, is_deleted=False).first()
        if not comm:
            pi_with_src = ProformaInvoice.objects.filter(
                order=order, source_communication__isnull=False,
            ).order_by('-created_at').first()
            if pi_with_src and pi_with_src.source_communication_id:
                comm = Communication.objects.filter(id=pi_with_src.source_communication_id, is_deleted=False).first()
        if not comm:
            product_names = [it.product_name for it in order.items.all() if it.product_name]
            if product_names:
                product_q = Q()
                for name in product_names:
                    product_q |= Q(subject__icontains=name) | Q(body__icontains=name)
                comm = Communication.objects.filter(
                    client=order.client, comm_type='email', direction='inbound', is_deleted=False,
                ).filter(product_q).order_by('-created_at').first()
        if not comm and order.order_number:
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', is_deleted=False,
            ).filter(Q(subject__icontains=order.order_number) | Q(body__icontains=order.order_number)).order_by('-created_at').first()
        if not comm:
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', direction='inbound', is_deleted=False,
            ).order_by('-created_at').first()
        if not comm:
            comm = Communication.objects.filter(
                client=order.client, comm_type='email', is_deleted=False,
            ).order_by('-created_at').first()

        # 2.5 Optional estimated delivery time — saved as Note + injected into email
        delivery_time = (request.data.get('estimated_delivery_time') or '').strip()
        if delivery_time:
            try:
                WorkflowEventLog.objects.create(
                    order=order, event_type='note',
                    description=f'Estimated Delivery: {delivery_time}',
                    metadata={'kind': 'estimated_delivery', 'value': delivery_time},
                    triggered_by=request.user,
                )
            except Exception:
                pass

        # 2.6 Optional BL Number — saved as Note + injected into email
        bl_number = (request.data.get('bl_number') or '').strip()
        if bl_number:
            try:
                # Avoid duplicating an identical note created moments earlier
                already = WorkflowEventLog.objects.filter(
                    order=order, event_type='note',
                    description=f'BL Number: {bl_number}',
                ).exists()
                if not already:
                    WorkflowEventLog.objects.create(
                        order=order, event_type='note',
                        description=f'BL Number: {bl_number}',
                        metadata={'kind': 'bl_number', 'value': bl_number},
                        triggered_by=request.user,
                    )
            except Exception:
                pass

        # 2.7 Sync the linked Shipment record with BL number + estimated arrival
        try:
            from orders.workflow_service import sync_shipment_from_order
            sync_shipment_from_order(
                order,
                bl_number=bl_number or None,
                estimated_arrival=delivery_time or None,
            )
        except Exception:
            pass

        # 3. Compose draft
        product_lines = ', '.join([(it.product_name or '') for it in order.items.all() if it.product_name])
        client_name = order.client.company_name if order.client else 'Valued Customer'
        delivery_html = f'<p><strong>Estimated Delivery:</strong> {delivery_time}</p>' if delivery_time else ''
        bl_html = f'<p><strong>Bill of Lading No.:</strong> {bl_number}</p>' if bl_number else ''
        ai_subject = f'Re: {comm.subject}' if comm and comm.subject else 'Shipment In Transit Update'
        ai_body = (
            f'<p>Dear {client_name},</p>'
            f'<p>We are pleased to inform you that your shipment '
            f'(<strong>{product_lines or "—"}</strong>) is now <strong>In Transit</strong>.</p>'
            f'{bl_html}'
            f'{delivery_html}'
            f'<p>Please find attached the <strong>Bill of Lading (BL)</strong>, <strong>Certificate of Origin (COO)</strong> '
            f'and <strong>Schedule List</strong> for your reference. Tracking and ETA details are reflected on the BL.</p>'
            f'<p>We will keep you posted on the shipment progress. Please do not hesitate to reach out if you require anything further.</p>'
            f'<p>Best regards,<br/>{getattr(request.user, "full_name", "") or request.user.username}</p>'
        )

        # 4. Resolve recipient
        to_email = ''
        if comm and getattr(comm, 'external_email', ''):
            to_email = comm.external_email
        if not to_email:
            from clients.models import Contact
            primary = Contact.objects.filter(client=order.client, is_primary=True).first() \
                or Contact.objects.filter(client=order.client).first()
            if primary and primary.email:
                to_email = primary.email

        # 5. Create / reuse draft. Only reuse a draft we previously stamped
        # for this order's transit — avoid hijacking an unrelated draft.
        draft = None
        if comm:
            for cand in EmailDraft.objects.filter(communication=comm, status='draft').order_by('-updated_at'):
                actions = (cand.editor_data or {}).get('auto_actions') or []
                if any(a.get('type') == 'order_transition' and a.get('order_id') == str(order.id) and a.get('to_status') == 'in_transit' for a in actions):
                    draft = cand
                    break
        if not draft:
            draft = EmailDraft.objects.create(
                communication=comm,
                to_email=to_email or '',
                subject=ai_subject,
                body=ai_body,
                cc='', status='draft',
                created_by=request.user, edited_by=request.user,
            )
        # Always overwrite to/subject/body so the user reviews fresh content.
        draft.to_email = to_email or draft.to_email
        draft.subject = ai_subject
        draft.body = ai_body
        draft.edited_by = request.user
        draft.save(update_fields=['to_email', 'subject', 'body', 'edited_by'])

        # Tag the draft with an explicit auto-action: transition to in_transit
        # when this draft is sent.
        ed = dict(draft.editor_data or {})
        actions = list(ed.get('auto_actions') or [])
        actions = [a for a in actions if not (a.get('type') == 'order_transition' and a.get('order_id') == str(order.id))]
        actions.append({'type': 'order_transition', 'order_id': str(order.id), 'to_status': 'in_transit', 'from_status': 'dispatched'})
        ed['auto_actions'] = actions
        draft.editor_data = ed
        draft.save(update_fields=['editor_data'])

        # 6. Replace any prior transit attachments, then attach BL, COO and
        # Schedule List on the in-transit draft so the customer receives all
        # the shipment-tracking documents in one email.
        TRANSIT_FILENAME_PREFIXES = ('BL_', 'COO_', 'Schedule_List_', 'Shipping_Bill_')
        for prefix in TRANSIT_FILENAME_PREFIXES:
            DraftAttachment.objects.filter(draft=draft, filename__startswith=prefix).delete()

        order_no = order.order_number or 'order'

        def _attach_transit_doc(doc_type, label):
            doc = OrderDocument.objects.filter(
                order=order, doc_type=doc_type, is_deleted=False,
            ).order_by('-created_at').first()
            if not doc or not doc.file:
                return
            try:
                doc.file.open('rb')
                content = doc.file.read()
                doc.file.close()
            except Exception:
                return
            if not content:
                return
            ext = (doc.name or doc.file.name or 'pdf').rsplit('.', 1)[-1].lower() or 'pdf'
            # Order id intentionally NOT in the filename — the client
            # doesn't need the internal order number on the document.
            filename = f'{label}.{ext}'
            att = DraftAttachment(draft=draft, filename=filename, file_size=len(content))
            att.file.save(filename, ContentFile(content), save=True)

        for doc_type, label in [
            ('bl', 'BL'),
            ('coo', 'COO'),
            ('schedule_list', 'Schedule_List'),
        ]:
            _attach_transit_doc(doc_type, label)

        # NOTE: Order is NOT transitioned here — only when the draft is sent.
        return Response({
            'draft_id': str(draft.id),
            'communication_id': str(comm.id) if comm else None,
            'status': order.status,
        })

    # ── Download PDF ──
    @action(detail=True, methods=['get'], url_path='download-pdf')
    def download_pdf(self, request, pk=None):
        order = self.get_object()
        from common.pdf_utils import generate_order_pdf
        pdf_buffer = generate_order_pdf(order)
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{order.order_number}.pdf"'
        return response
