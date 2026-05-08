from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Sample, SampleFeedback, SampleDocument
from .serializers import SampleSerializer, SampleFeedbackSerializer, SampleDocumentSerializer
from notifications.helpers import notify


class SampleViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = SampleSerializer
    filterset_fields = ['client', 'status']
    search_fields = ['product_name', 'tracking_number']
    def get_queryset(self):
        return (Sample.objects
                .filter(is_deleted=False)
                .exclude(client__company_name__icontains='(Auto-created)')
                .select_related('client', 'product', 'created_by'))

    def perform_create(self, serializer):
        sample = serializer.save(created_by=self.request.user)
        notify(
            title=f'Sample created: {sample.product_name}',
            message=f'{self.request.user.full_name} created sample for {sample.client.company_name}.',
            notification_type='system', link='/samples',
            actor=self.request.user, client=sample.client,
        )

    def perform_update(self, serializer):
        sample = serializer.save()
        notify(
            title=f'Sample updated: {sample.product_name}',
            message=f'{self.request.user.full_name} updated sample status to {sample.status.replace("_", " ")}.',
            notification_type='system', link='/samples',
            actor=self.request.user, client=sample.client,
        )

    @action(detail=False, methods=['post'], url_path='create-from-email')
    def create_from_email(self, request):
        """Create a Sample request pre-filled from an inbound email.

        Body:
          - client_id (required)
          - communication_id (optional) — uses resolve_line_item_from_email
            to extract product/quantity from the source email

        Same flow as Quotation/PI create-blank: matches/creates the product
        in the Products tab, and ties the Sample to the source communication
        so future clicks reuse the same record (and the row appears in the
        client's Samples tab automatically).
        """
        client_id = request.data.get('client_id')
        communication_id = request.data.get('communication_id')
        if not client_id:
            return Response({'error': 'client_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        from clients.models import Client
        try:
            client = Client.objects.get(id=client_id, is_deleted=False)
        except Client.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)

        # Reuse existing sample tied to this communication if any
        if communication_id:
            existing = Sample.objects.filter(
                source_communication_id=communication_id, is_deleted=False
            ).order_by('-created_at').first()
            if existing:
                return Response(SampleSerializer(existing).data, status=status.HTTP_200_OK)

        # Resolve ALL products / quantities from the source email — clients
        # often request multiple products in one email.
        lines = []
        if communication_id:
            try:
                from communications.models import Communication
                from communications.auto_quote_service import resolve_line_items_from_email
                comm = Communication.objects.filter(id=communication_id).first()
                if comm:
                    lines = resolve_line_items_from_email(client, comm) or []
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f'Sample pre-fill failed: {e}')

        # Create the parent Sample (mirror first item into legacy fields for
        # backward compatibility with code that still reads sample.product_name)
        first = lines[0] if lines else {}
        first_qty_str = ''
        if first:
            qv = first.get('quantity') or 0
            u = first.get('unit') or ''
            first_qty_str = f"{qv:g} {u}".strip() if qv else ''
        sample = Sample.objects.create(
            client=client,
            source_communication_id=communication_id if communication_id else None,
            product=first.get('product'),
            product_name=first.get('product_name') or '',
            client_product_name=first.get('client_product_name') or '',
            quantity=first_qty_str,
            notes='Auto-created from client email request.',
            created_by=request.user,
        )

        # Create one SampleItem per extracted line
        from .models import SampleItem
        for line in lines:
            qv = line.get('quantity') or 0
            u = line.get('unit') or ''
            qty_str = f"{qv:g} {u}".strip() if qv else ''
            SampleItem.objects.create(
                sample=sample,
                product=line.get('product'),
                product_name=line.get('product_name') or '',
                client_product_name=line.get('client_product_name') or '',
                quantity=qty_str,
            )

        notify(
            title=f'Sample request created: {sample.product_name or "Pending"}',
            message=f'{request.user.full_name} created a sample request for {client.company_name}.',
            notification_type='system', link=f'/clients/{client.id}',
            actor=request.user, client=client,
        )
        return Response(SampleSerializer(sample).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='advance')
    def advance(self, request, pk=None):
        """Advance the sample to the next workflow step.

        Body params (all optional, depends on target step):
          - target: prepared | dispatched | delivered
          - tracking_number, courier_details (when target=dispatched)

        Returns the updated Sample.
        """
        from django.utils import timezone as _tz
        sample = self.get_object()
        target = (request.data.get('target') or '').strip().lower()
        tracking_number = (request.data.get('tracking_number') or '').strip()
        courier_details = (request.data.get('courier_details') or '').strip()

        # Step-by-step gate: target must be the immediate next step in the
        # workflow for this sample type. Skipping is rejected.
        # Free   : requested → prepared → dispatched → delivered → feedback_pending → feedback_received
        # Paid   : requested → replied → prepared → payment_received → dispatched → delivered → feedback_pending → feedback_received
        if sample.sample_type == 'paid':
            chain = ['requested', 'replied', 'prepared', 'payment_received',
                     'dispatched', 'delivered', 'feedback_pending', 'feedback_received']
        else:
            chain = ['requested', 'prepared', 'dispatched', 'delivered',
                     'feedback_pending', 'feedback_received']
        try:
            cur_idx = chain.index(sample.status)
            tgt_idx = chain.index(target)
        except ValueError:
            return Response(
                {'error': f'Unknown target "{target}" for this sample type.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Only allow forward by exactly one step (feedback_received from
        # feedback_pending is part of the chain too, so it works).
        if tgt_idx != cur_idx + 1:
            human = chain[cur_idx + 1] if cur_idx + 1 < len(chain) else 'feedback'
            return Response(
                {'error': f'Cannot jump to "{target}" — please advance step by step. Next allowed: "{human}".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target == 'replied':
            sample.status = Sample.Status.REPLIED
            if not sample.replied_at:
                sample.replied_at = _tz.now()
        elif target == 'prepared':
            sample.status = Sample.Status.PREPARED
            sample.prepared_at = _tz.now()
        elif target == 'payment_received':
            sample.status = Sample.Status.PAYMENT_RECEIVED
            sample.payment_received_at = _tz.now()
        elif target == 'dispatched':
            # Paid samples: enforce Payment Received + FIRC confirmation at
            # the dispatch boundary. The frontend renders the FIRC checkbox
            # at this stage; clients must POST firc_received=true (or have
            # firc_received_at already populated) to advance.
            if sample.sample_type == 'paid':
                if not sample.payment_received_at:
                    return Response(
                        {'error': 'Payment must be received before dispatching a paid sample.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                firc_flag = request.data.get('firc_received')
                if firc_flag is True or str(firc_flag).lower() in ('true', '1', 'yes'):
                    if not sample.firc_received_at:
                        sample.firc_received_at = _tz.now()
                if not sample.firc_received_at:
                    return Response(
                        {'error': 'FIRC must be confirmed before dispatching a paid sample.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            sample.status = Sample.Status.DISPATCHED
            if tracking_number:
                sample.tracking_number = tracking_number
            if courier_details:
                sample.courier_details = courier_details
            if not sample.dispatch_date:
                sample.dispatch_date = _tz.now().date()
        elif target == 'delivered':
            sample.status = Sample.Status.DELIVERED
            sample.delivered_at = _tz.now()
        elif target == 'feedback_pending':
            sample.status = Sample.Status.FEEDBACK_PENDING
        elif target == 'feedback_received':
            sample.status = Sample.Status.FEEDBACK_RECEIVED
        else:
            return Response({'error': f'Unknown target: {target}'}, status=status.HTTP_400_BAD_REQUEST)

        sample.save()
        notify(
            title=f'Sample {target.replace("_", " ")}: {sample.product_name or "(no product)"}',
            message=f'{request.user.full_name} marked sample as {target.replace("_", " ")} for {sample.client.company_name}.',
            notification_type='system', link=f'/samples/{sample.id}',
            actor=request.user, client=sample.client,
        )
        # Schedule the post-delivery feedback reminder. Fires after the
        # configured delay (5 min for testing) and only if the sample is
        # still sitting at 'delivered' — i.e. nobody has logged feedback yet.
        if target == 'delivered':
            try:
                from .tasks import schedule_sample_feedback_reminder
                schedule_sample_feedback_reminder(sample.id)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(
                    f'Could not schedule feedback reminder for sample {sample.id}: {e}'
                )
        return Response(SampleSerializer(sample).data)

    @action(detail=True, methods=['post'], url_path='revert')
    def revert(self, request, pk=None):
        """Revert the sample to the previous step in the workflow.

        Only admins and managers can actually perform a revert. If an
        executive triggers this endpoint, the revert is NOT applied and
        a notification is sent to admin/manager instead so they can
        review and approve the rollback.

        Walks one step backwards through:
            requested → prepared → dispatched → delivered → feedback_pending → feedback_received

        Clears the timestamp for the step being undone so the stepper UI
        reflects the correct progress.
        """
        sample = self.get_object()

        # Role gate: only admin/manager can revert. Executives get a 403 and
        # an admin/manager notification is created so they're aware of the
        # request.
        if request.user.role not in ('admin', 'manager'):
            try:
                product = sample.product_name or sample.client_product_name or '(no product)'
                client_name = sample.client.company_name if sample.client else 'Unknown client'
                notify(
                    title=f'Revert requested: {product}',
                    message=(
                        f'{request.user.full_name} (executive) attempted to revert the sample for '
                        f'{client_name} from "{sample.status.replace("_", " ").title()}". '
                        f'Please review and revert it manually if appropriate.'
                    ),
                    notification_type='alert',
                    link=f'/samples/{sample.id}',
                    actor=request.user,  # don't notify the executive themselves
                    client=sample.client,
                )
            except Exception:
                pass
            return Response(
                {'error': 'Only admin or manager can revert a sample. The admin/manager has been notified of your request.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        order = ['requested', 'replied', 'prepared', 'payment_received',
                 'dispatched', 'delivered', 'feedback_pending', 'feedback_received']
        try:
            cur_idx = order.index(sample.status)
        except ValueError:
            return Response({'error': 'Unknown current status'}, status=status.HTTP_400_BAD_REQUEST)
        if cur_idx == 0:
            return Response({'error': 'Already at the first step — nothing to revert'},
                            status=status.HTTP_400_BAD_REQUEST)

        # Clear the timestamp for the step we're leaving
        leaving = sample.status
        if leaving == 'prepared':
            sample.prepared_at = None
            # Re-arm the reminder so it can fire again if no progress is made
            sample.reminder_sent_at = None
        elif leaving == 'dispatched':
            sample.dispatch_date = None
            sample.tracking_number = ''
            sample.courier_details = ''
        elif leaving == 'delivered':
            sample.delivered_at = None
        elif leaving in ('feedback_pending', 'feedback_received'):
            # If we're reverting from a feedback state, drop the feedback row too
            try:
                if hasattr(sample, 'feedback') and sample.feedback is not None:
                    sample.feedback.delete()
            except Exception:
                pass

        sample.status = order[cur_idx - 1]
        sample.save()

        notify(
            title=f'Sample reverted to {sample.status.replace("_", " ").title()}',
            message=f'{request.user.full_name} reverted the sample status for {sample.client.company_name}.',
            notification_type='alert', link=f'/samples/{sample.id}',
            actor=request.user, client=sample.client,
        )
        return Response(SampleSerializer(sample).data)

    @action(detail=True, methods=['get'], url_path='timeline')
    def timeline(self, request, pk=None):
        """Return the Sample workflow timeline for the stepper UI.

        Free samples (6 steps):
            1. Mail Received → 2. Reply Mail → 3. Prepared → 4. Dispatched
            → 5. Delivered → 6. Feedback

        Paid samples (7 steps):
            1. Mail Received → 2. Reply Mail → 3. Prepared → 4. Payment Received
            → 5. Dispatched (with FIRC) → 6. Delivered → 7. Feedback
        """
        sample = self.get_object()
        is_paid = sample.sample_type == 'paid'

        # Use the chain that matches the sample type — same chain the
        # serializer enforces step-by-step transitions on.
        if is_paid:
            chain = ['requested', 'replied', 'prepared', 'payment_received',
                     'dispatched', 'delivered', 'feedback_pending', 'feedback_received']
        else:
            chain = ['requested', 'prepared', 'dispatched', 'delivered',
                     'feedback_pending', 'feedback_received']
        try:
            cur_idx = chain.index(sample.status)
        except ValueError:
            cur_idx = 0

        def _passed(stage):
            try:
                return cur_idx >= chain.index(stage)
            except ValueError:
                return False

        has_feedback = hasattr(sample, 'feedback') and sample.feedback is not None

        steps = [
            {
                'key': 'mail_received',
                'label': 'Mail Received',
                'completed': bool(sample.source_communication_id) or bool(sample.created_at),
                'timestamp': (
                    sample.source_communication.created_at if sample.source_communication_id
                    else sample.created_at
                ),
            },
            {
                'key': 'reply_mail',
                'label': 'Reply Mail',
                # Free samples track this purely by replied_at (since "replied"
                # isn't a status). Paid samples advance the status to "replied"
                # so the chain index also satisfies it.
                'completed': bool(sample.replied_at) or (is_paid and _passed('replied')),
                'timestamp': sample.replied_at,
            },
            {
                'key': 'prepared',
                'label': 'Prepared',
                'completed': _passed('prepared'),
                'timestamp': sample.prepared_at,
            },
        ]

        if is_paid:
            steps.append({
                'key': 'payment_received',
                'label': 'Payment Received',
                'completed': _passed('payment_received'),
                'timestamp': sample.payment_received_at,
            })

        steps.append({
            'key': 'dispatched',
            'label': 'Dispatched (FIRC)' if is_paid else 'Dispatched',
            'completed': _passed('dispatched'),
            'timestamp': sample.dispatch_date,
            'firc_received': bool(sample.firc_received_at) if is_paid else None,
        })
        steps.append({
            'key': 'delivered',
            'label': 'Delivered',
            'completed': _passed('delivered'),
            'timestamp': sample.delivered_at,
        })
        steps.append({
            'key': 'feedback',
            'label': 'Feedback',
            'completed': has_feedback,
            'timestamp': sample.feedback.created_at if has_feedback else None,
        })

        # Mark the first incomplete step as "current"
        for s in steps:
            s['state'] = 'completed' if s['completed'] else 'pending'
        for s in steps:
            if s['state'] == 'pending':
                s['state'] = 'current'
                break
        return Response(steps)

    @action(detail=True, methods=['post'])
    def add_feedback(self, request, pk=None):
        sample = self.get_object()
        serializer = SampleFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(sample=sample)
        sample.status = 'feedback_received'
        sample.save()
        notify(
            title=f'Sample feedback received: {sample.product_name}',
            message=f'Feedback received for sample sent to {sample.client.company_name}.',
            notification_type='alert', link='/samples',
            actor=request.user, client=sample.client,
        )
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'], url_path='documents')
    def documents(self, request, pk=None):
        """List or upload documents for a sample."""
        sample = self.get_object()
        if request.method == 'GET':
            docs = SampleDocument.objects.filter(sample=sample).order_by('-created_at')
            return Response(SampleDocumentSerializer(docs, many=True).data)
        # POST — upload
        f = request.FILES.get('file')
        if not f:
            return Response({'error': 'file is required'}, status=status.HTTP_400_BAD_REQUEST)
        doc = SampleDocument.objects.create(
            sample=sample,
            doc_type=request.data.get('doc_type', 'other'),
            name=request.data.get('name', f.name),
            file=f,
            uploaded_by=request.user,
        )
        return Response(SampleDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path='documents/(?P<doc_id>[^/.]+)')
    def delete_document(self, request, pk=None, doc_id=None):
        """Delete a sample document (admin/manager only)."""
        if request.user.role not in ('admin', 'manager'):
            return Response({'error': 'Only admin and manager can delete documents'}, status=status.HTTP_403_FORBIDDEN)
        sample = self.get_object()
        try:
            doc = SampleDocument.objects.get(id=doc_id, sample=sample)
            doc.delete()
            return Response({'status': 'deleted'})
        except SampleDocument.DoesNotExist:
            return Response({'error': 'Document not found'}, status=status.HTTP_404_NOT_FOUND)
