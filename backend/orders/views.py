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


class OrderViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = OrderSerializer
    filterset_fields = ['client', 'status']
    search_fields = ['order_number']

    def get_queryset(self):
        return Order.objects.filter(is_deleted=False).select_related('client', 'created_by', 'quotation').prefetch_related('items')

    def perform_create(self, serializer):
        order = serializer.save(created_by=self.request.user)
        notify(
            title=f'New order: {order.order_number}',
            message=f'{self.request.user.full_name} created order for {order.client.company_name}.',
            notification_type='system', link='/sales-orders',
            actor=self.request.user, client=order.client,
        )

    @action(detail=True, methods=['post'], url_path='add-item')
    def add_item(self, request, pk=None):
        """Add a line item to an order."""
        from .models import OrderItem
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
            attachments = []
            for idx, f in enumerate(files):
                kind = kinds[idx] if idx < len(kinds) else 'file'
                doc = OrderDocument.objects.create(
                    order=order,
                    doc_type='note_attachment',
                    name=f.name,
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

        if not doc_file:
            return Response({'error': 'File is required'}, status=status.HTTP_400_BAD_REQUEST)

        doc = OrderDocument.objects.create(
            order=order, doc_type=doc_type, name=name,
            file=doc_file, uploaded_by=request.user,
        )

        WorkflowEventLog.objects.create(
            order=order, event_type='doc_uploaded',
            description=f'Document uploaded: {name} ({doc_type})',
            metadata={'filename': name, 'doc_type': doc_type},
            triggered_by=request.user,
        )

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
        #    a) Any PI for this order whose source_communication is set
        #    b) Inbound email mentioning a product from this order
        #    c) Inbound email mentioning the order number
        #    d) Fallback: most recent inbound from the client
        from django.db.models import Q
        from finance.models import ProformaInvoice
        comm = None
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
            f'Client Invoice, Client Packing List, COA, MSDS, Insurance, and the factory stuffing photos.</p>'
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

        # Create / reuse the draft
        if comm:
            draft = EmailDraft.objects.filter(communication=comm, status='draft').order_by('-updated_at').first()
        else:
            draft = None
        if not draft:
            draft = EmailDraft.objects.create(
                communication=comm,
                to_email=to_email or '',
                subject=ai_subject,
                body=ai_body,
                cc='',
                status='draft',
                created_by=request.user,
                edited_by=request.user,
            )
        else:
            update_fields = ['edited_by']
            if not (draft.to_email or '').strip() and to_email:
                draft.to_email = to_email; update_fields.append('to_email')
            if not (draft.subject or '').strip():
                draft.subject = ai_subject; update_fields.append('subject')
            draft.body = ai_body; update_fields.append('body')
            draft.edited_by = request.user
            draft.save(update_fields=update_fields)

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

        for doc_type, label in [
            ('client_invoice', 'Client_Invoice'),
            ('client_packing_list', 'Client_Packing_List'),
            ('coa', 'COA'),
            ('msds', 'MSDS'),
            ('insurance', 'Insurance'),
        ]:
            doc = OrderDocument.objects.filter(order=order, doc_type=doc_type, is_deleted=False).order_by('-created_at').first()
            if doc:
                _attach_doc(doc, f'{label}_{order_no}.{_ext_of(doc)}')

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
                    _attach_doc(photo, f'Factory_Stuffing_{order_no}_{photo_counter["n"]}.{_ext_of(photo)}')

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

        # 2. Same thread-resolution algorithm as dispatch
        from finance.models import ProformaInvoice
        comm = None
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

        # 3. Compose draft
        product_lines = ', '.join([(it.product_name or '') for it in order.items.all() if it.product_name])
        client_name = order.client.company_name if order.client else 'Valued Customer'
        ai_subject = f'Re: {comm.subject}' if comm and comm.subject else 'Shipment In Transit Update'
        ai_body = (
            f'<p>Dear {client_name},</p>'
            f'<p>We are pleased to inform you that your shipment '
            f'(<strong>{product_lines or "—"}</strong>) is now <strong>In Transit</strong>.</p>'
            f'<p>Please find attached the <strong>Bill of Lading (BL)</strong> for your reference. '
            f'Tracking and ETA details are reflected on the BL.</p>'
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

        # 5. Create / reuse draft
        if comm:
            draft = EmailDraft.objects.filter(communication=comm, status='draft').order_by('-updated_at').first()
        else:
            draft = None
        if not draft:
            draft = EmailDraft.objects.create(
                communication=comm,
                to_email=to_email or '',
                subject=ai_subject,
                body=ai_body,
                cc='', status='draft',
                created_by=request.user, edited_by=request.user,
            )
        else:
            update_fields = ['edited_by']
            if not (draft.to_email or '').strip() and to_email:
                draft.to_email = to_email; update_fields.append('to_email')
            if not (draft.subject or '').strip():
                draft.subject = ai_subject; update_fields.append('subject')
            draft.body = ai_body; update_fields.append('body')
            draft.edited_by = request.user
            draft.save(update_fields=update_fields)

        # 6. Replace any prior transit attachment, then attach the BL only
        TRANSIT_FILENAME_PREFIXES = ('BL_',)
        for prefix in TRANSIT_FILENAME_PREFIXES:
            DraftAttachment.objects.filter(draft=draft, filename__startswith=prefix).delete()

        order_no = order.order_number or 'order'
        bl_doc = OrderDocument.objects.filter(order=order, doc_type='bl', is_deleted=False).order_by('-created_at').first()
        if bl_doc and bl_doc.file:
            try:
                bl_doc.file.open('rb')
                content = bl_doc.file.read()
                bl_doc.file.close()
            except Exception:
                content = None
            if content:
                ext = (bl_doc.name or bl_doc.file.name or 'pdf').rsplit('.', 1)[-1].lower() or 'pdf'
                filename = f'BL_{order_no}.{ext}'
                att = DraftAttachment(draft=draft, filename=filename, file_size=len(content))
                att.file.save(filename, ContentFile(content), save=True)

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
