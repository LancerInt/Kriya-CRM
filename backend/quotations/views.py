from common.models import SoftDeleteViewMixin
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Q
from .models import Inquiry, Quotation, QuotationItem
from .serializers import InquirySerializer, QuotationSerializer, QuotationCreateSerializer
from orders.models import Order, OrderItem
from finance.models import Invoice
from notifications.helpers import notify

class InquiryViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    serializer_class = InquirySerializer
    filterset_fields = ['client', 'stage', 'source', 'assigned_to']
    search_fields = ['product_name', 'requirements']
    def get_queryset(self):
        qs = Inquiry.objects.filter(is_deleted=False).select_related('client', 'assigned_to', 'product')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(Q(client__in=client_ids) | Q(assigned_to=user))
        return qs
    def perform_create(self, serializer):
        inquiry = serializer.save()
        if not inquiry.assigned_to:
            inquiry.assigned_to = self.request.user
            inquiry.save()
        from tasks.models import Task
        from notifications.models import Notification
        assigned_user = inquiry.assigned_to or self.request.user
        Task.objects.create(
            title=f'Follow up on inquiry from {inquiry.client.company_name}',
            client=inquiry.client, owner=assigned_user,
            created_by=self.request.user, priority='high', is_auto_generated=True,
            linked_type='inquiry', linked_id=inquiry.id
        )
        notify(
            title=f'New inquiry: {inquiry.client.company_name}',
            message=f'New inquiry from {inquiry.client.company_name} for {inquiry.product_name or "N/A"}. A follow-up task has been created.',
            notification_type='task', link='/inquiries',
            actor=self.request.user, client=inquiry.client,
            extra_users=[assigned_user],
        )

    @action(detail=True, methods=['post'])
    def advance(self, request, pk=None):
        inquiry = self.get_object()
        stage_order = ['inquiry', 'discussion', 'sample', 'quotation', 'negotiation', 'order_confirmed']

        new_stage = request.data.get('stage')
        if not new_stage:
            try:
                current_idx = stage_order.index(inquiry.stage)
                if current_idx < len(stage_order) - 1:
                    new_stage = stage_order[current_idx + 1]
                else:
                    return Response({'error': 'Already at final stage'}, status=status.HTTP_400_BAD_REQUEST)
            except ValueError:
                return Response({'error': 'Invalid current stage'}, status=status.HTTP_400_BAD_REQUEST)

        old_stage = inquiry.stage
        inquiry.stage = new_stage
        inquiry.save()

        # Auto-create tasks and notifications based on stage
        from notifications.models import Notification
        from tasks.models import Task

        assigned = inquiry.assigned_to or (inquiry.client.primary_executive if inquiry.client else None)
        client_name = inquiry.client.company_name if inquiry.client else 'Unknown'

        if new_stage == 'discussion' and assigned:
            Task.objects.create(
                title=f'Follow up with {client_name} on inquiry',
                description=f'Client showed interest. Discuss product requirements, pricing, and terms.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='medium',
            )

        elif new_stage == 'sample' and assigned:
            Task.objects.create(
                title=f'Arrange sample for {client_name}',
                description=f'Product: {inquiry.product_name or "TBD"}. Prepare and dispatch sample.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='high',
            )

        elif new_stage == 'quotation' and assigned:
            Task.objects.create(
                title=f'Prepare quotation for {client_name}',
                description=f'Product: {inquiry.product_name or "TBD"}. Create quotation in Quotations page.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='high',
            )

        elif new_stage == 'negotiation' and assigned:
            Task.objects.create(
                title=f'Negotiate terms with {client_name}',
                description=f'Client is negotiating. Review pricing and terms.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='high',
            )

        elif new_stage == 'order_confirmed' and assigned:
            Task.objects.create(
                title=f'Create order for {client_name}',
                description=f'Order confirmed! Go to Quotations > Convert to Order.',
                client=inquiry.client, owner=assigned, created_by=request.user,
                priority='urgent',
            )

        notify(
            title=f'Pipeline: {client_name} → {new_stage.replace("_", " ").title()}',
            message=f'Inquiry moved from "{old_stage}" to "{new_stage.replace("_", " ")}" by {request.user.full_name}.',
            notification_type='task', link='/inquiries',
            actor=request.user, client=inquiry.client,
            extra_users=[assigned] if assigned else [],
        )

        return Response(InquirySerializer(inquiry).data)

class QuotationViewSet(SoftDeleteViewMixin, viewsets.ModelViewSet):
    filterset_fields = ['client', 'status']
    search_fields = ['quotation_number']
    def get_queryset(self):
        qs = Quotation.objects.filter(is_deleted=False).select_related('client', 'created_by', 'approved_by').prefetch_related('items')
        user = self.request.user
        if user.role == 'executive':
            from clients.views import get_client_qs_for_user
            client_ids = get_client_qs_for_user(user).values_list('id', flat=True)
            qs = qs.filter(Q(client__in=client_ids) | Q(created_by=user))
        return qs

    @action(detail=False, methods=['get'], url_path='count')
    def count_for_user(self, request):
        """Count of DRAFT quotations the current user can see (role-filtered).

        Used by the header badge — same role filtering as the list endpoint.
        """
        count = self.get_queryset().filter(status='draft').count()
        return Response({'count': count})
    def get_serializer_class(self):
        if self.action in ['create']:
            return QuotationCreateSerializer
        return QuotationSerializer

    @action(detail=False, methods=['post'], url_path='create-blank')
    def create_blank(self, request):
        """Create a blank quotation for a client.

        If `communication_id` is provided, the first line item is pre-filled from
        the email context using AI extraction (product, quantity, unit) plus the
        client's price list / Products tab for pricing.
        """
        client_id = request.data.get('client_id')
        communication_id = request.data.get('communication_id')
        if not client_id:
            return Response({'error': 'client_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        from clients.models import Client
        try:
            client = Client.objects.get(id=client_id)
        except Client.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)

        # ── Resolve the line item from the source email up-front ──
        # This works for BOTH new and previously-generated drafts: any time the
        # button is clicked we re-run the AI extractor against the original email.
        line = None
        comm = None
        if communication_id:
            try:
                from communications.models import Communication
                from communications.auto_quote_service import resolve_line_item_from_email
                comm = Communication.objects.filter(id=communication_id).first()
                if comm:
                    line = resolve_line_item_from_email(client, comm)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f'Quotation pre-fill failed: {e}')

        # ── Reuse / repair an existing quotation linked to this communication ──
        # If the auto-pipeline already created a Quotation for this email:
        #   - Has real items → just return it (preserves quote number, manual edits).
        #   - Empty items → repair it in-place using the freshly-extracted line so
        #     previously-generated drafts get the same auto-fill new ones do, and
        #     we don't accumulate orphan empty quotations.
        if communication_id:
            try:
                from communications.models import QuoteRequest
                qr = QuoteRequest.objects.filter(
                    source_communication_id=communication_id,
                    linked_quotation__isnull=False,
                    linked_quotation__is_deleted=False,
                ).select_related('linked_quotation').first()
                if qr and qr.linked_quotation:
                    existing = qr.linked_quotation
                    # Only treat as "already populated" if at least one item has
                    # BOTH a product name AND a non-zero unit price. Stale rows
                    # from earlier parser runs (name only, price 0) get repaired.
                    has_real_item = existing.items.exclude(product_name='').filter(unit_price__gt=0).exists()
                    if has_real_item:
                        return Response(QuotationSerializer(existing).data, status=status.HTTP_200_OK)
                    # Empty linked quotation → repair in-place from the resolved line
                    if line:
                        existing.items.all().delete()
                        qty = line['quantity']
                        price = line['unit_price']
                        QuotationItem.objects.create(
                            quotation=existing,
                            product=line['product'],
                            product_name=line['product_name'],
                            client_product_name=line['client_product_name'],
                            description=line['description'],
                            quantity=qty, unit=line['unit'],
                            unit_price=price, total_price=qty * price,
                        )
                        update_fields = []
                        if line.get('currency'):
                            existing.currency = line['currency']; update_fields.append('currency')
                        if line.get('destination_country') and not existing.country_of_final_destination:
                            existing.country_of_final_destination = line['destination_country']; update_fields.append('country_of_final_destination')
                        if line.get('destination_port') and not existing.port_of_discharge:
                            existing.port_of_discharge = line['destination_port']; update_fields.append('port_of_discharge')
                        existing.subtotal = qty * price
                        existing.total = qty * price
                        update_fields += ['subtotal', 'total']
                        existing.save(update_fields=update_fields)
                        return Response(QuotationSerializer(existing).data, status=status.HTTP_200_OK)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f'Linked quotation repair failed: {e}')

        # ── Auto-versioning ──
        # If the client already has a previously SENT quotation tied to a
        # *different* email, treat the current click as a revision request.
        # The new row inherits structural fields from the previous quote and
        # carries version+1 with parent → previous quotation, so the V1/V2/V3
        # history is preserved on the Quotations list.
        parent_q = None
        next_version = 1
        if communication_id:
            previous_q = Quotation.objects.filter(
                client=client,
                is_deleted=False,
                status__in=['sent', 'approved', 'accepted'],
            ).order_by('-created_at').first()
            if previous_q:
                # Only treat as a revision if the previous quotation came from
                # a *different* email — otherwise it's the same conversation.
                from communications.models import QuoteRequest
                same_comm = QuoteRequest.objects.filter(
                    linked_quotation=previous_q,
                    source_communication_id=communication_id,
                ).exists()
                if not same_comm:
                    parent_q = previous_q
                    next_version = (previous_q.version or 1) + 1

        from .models import generate_quotation_number
        delivery = (line or {}).get('delivery_terms', '')
        if parent_q:
            q = Quotation.objects.create(
                quotation_number=generate_quotation_number(),
                client=client,
                inquiry=parent_q.inquiry,
                version=next_version,
                parent=parent_q,
                currency=(line or {}).get('currency') or parent_q.currency,
                delivery_terms=delivery if delivery in dict(Quotation.DELIVERY_CHOICES) else (parent_q.delivery_terms or 'FOB'),
                payment_terms=parent_q.payment_terms,
                payment_terms_detail=parent_q.payment_terms_detail,
                freight_terms=parent_q.freight_terms,
                country_of_origin=parent_q.country_of_origin or 'India',
                country_of_final_destination=(line or {}).get('destination_country') or parent_q.country_of_final_destination,
                port_of_loading=parent_q.port_of_loading,
                port_of_discharge=(line or {}).get('destination_port') or parent_q.port_of_discharge,
                vessel_flight_no=parent_q.vessel_flight_no,
                final_destination=parent_q.final_destination,
                packaging_details=parent_q.packaging_details,
                display_overrides=parent_q.display_overrides,
                validity_days=parent_q.validity_days,
                created_by=request.user,
            )
        else:
            q = Quotation.objects.create(
                quotation_number=generate_quotation_number(),
                client=client,
                currency=(line or {}).get('currency') or client.preferred_currency or 'USD',
                delivery_terms=delivery if delivery in dict(Quotation.DELIVERY_CHOICES) else 'FOB',
                country_of_origin='India',
                country_of_final_destination=(line or {}).get('destination_country') or client.country or '',
                port_of_discharge=(line or {}).get('destination_port') or '',
                created_by=request.user,
            )
        # Add the (pre-filled or blank) first item
        if line:
            qty = line['quantity']
            price = line['unit_price']
            QuotationItem.objects.create(
                quotation=q,
                product=line['product'],
                product_name=line['product_name'],
                client_product_name=line['client_product_name'],
                description=line['description'],
                quantity=qty,
                unit=line['unit'],
                unit_price=price,
                total_price=qty * price,
            )
        else:
            QuotationItem.objects.create(
                quotation=q, product_name='', description='',
                quantity=0, unit='KG', unit_price=0, total_price=0,
            )
        # ── Link to QuoteRequest for the source communication ──
        # Ensures the quotation appears on the correct Inquiry card, not on an
        # older one for the same client. If no QuoteRequest exists for this
        # communication, create one so the Inquiries page picks it up.
        if communication_id:
            from communications.models import QuoteRequest
            qr = QuoteRequest.objects.filter(
                source_communication_id=communication_id,
            ).first()
            if qr:
                if not qr.linked_quotation_id:
                    qr.linked_quotation = q
                    qr.status = 'converted'
                    qr.save(update_fields=['linked_quotation', 'status'])
            else:
                # Create a QuoteRequest so this quotation shows on the Inquiries page
                QuoteRequest.objects.create(
                    source_communication_id=communication_id,
                    source_channel='email',
                    client=client,
                    sender_name=(comm.contact.name if comm and comm.contact else ''),
                    sender_email=comm.external_email if comm else '',
                    extracted_product=line['product_name'] if line else '',
                    extracted_quantity=line['quantity'] if line else None,
                    extracted_unit=line['unit'] if line else '',
                    ai_confidence=1.0,
                    status='converted',
                    linked_quotation=q,
                )

        notify(
            title=f'Quotation created: {q.quotation_number}',
            message=f'{request.user.full_name} created a quotation for {client.company_name}.',
            notification_type='system', link='/quotations',
            actor=request.user, client=client,
        )
        return Response(QuotationSerializer(q).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='revise')
    def revise(self, request, pk=None):
        """Create a new version of this quotation, copying all items.

        Always pivots off the LATEST version in the chain (not the row the
        user clicked on), and reuses an existing draft revision if one is
        already sitting in the chain — so cancelling Revise and clicking it
        again no longer inflates the version number past what was actually sent.
        """
        clicked = self.get_object()
        from .models import generate_quotation_number

        # Walk to the latest version in the chain
        root = clicked
        while root.parent_id:
            root = root.parent
        all_ids = {root.id}
        stack = [root]
        while stack:
            node = stack.pop()
            for child in Quotation.objects.filter(parent=node, is_deleted=False).only('id', 'parent_id'):
                if child.id not in all_ids:
                    all_ids.add(child.id)
                    stack.append(child)
        original = (
            Quotation.objects.filter(id__in=all_ids, is_deleted=False)
            .order_by('-version', '-created_at')
            .first()
        ) or clicked

        # Reuse an existing unsent draft revision instead of spawning another
        # one. Cancelling Revise without sending leaves a draft V(n+1) row;
        # next click should hand it back rather than create V(n+2).
        if original.status == 'draft' and original.parent_id and original.id != clicked.id:
            return Response(QuotationSerializer(original).data, status=status.HTTP_200_OK)

        new_version = original.version + 1
        q = Quotation.objects.create(
            quotation_number=generate_quotation_number(),
            client=original.client,
            inquiry=original.inquiry,
            version=new_version,
            parent=original,
            currency=original.currency,
            delivery_terms=original.delivery_terms,
            payment_terms=original.payment_terms,
            payment_terms_detail=original.payment_terms_detail,
            freight_terms=original.freight_terms,
            country_of_origin=original.country_of_origin,
            country_of_final_destination=original.country_of_final_destination,
            port_of_loading=original.port_of_loading,
            port_of_discharge=original.port_of_discharge,
            vessel_flight_no=original.vessel_flight_no,
            final_destination=original.final_destination,
            packaging_details=original.packaging_details,
            display_overrides=original.display_overrides,
            validity_days=original.validity_days,
            notes=original.notes,
            created_by=request.user,
        )
        total = 0
        for item in original.items.all():
            QuotationItem.objects.create(
                quotation=q, product=item.product,
                product_name=item.product_name,
                client_product_name=item.client_product_name,
                description=item.description,
                quantity=item.quantity, unit=item.unit,
                unit_price=item.unit_price, total_price=item.total_price,
            )
            total += float(item.total_price)
        q.subtotal = total
        q.total = total
        q.save(update_fields=['subtotal', 'total'])

        # NOTE: We intentionally do NOT change the original's status here.
        # Both the old version and the new revision should remain as full
        # records on the Quotations list (the V1/V2/... badges + parent link
        # are how the user tells them apart). Marking the original 'expired'
        # would hide it from the active list and lose the audit trail.

        notify(
            title=f'Quotation revised: {q.quotation_number} (v{new_version})',
            message=f'{request.user.full_name} created revision v{new_version} from {original.quotation_number}.',
            notification_type='system', link='/quotations',
            actor=request.user, client=q.client,
        )
        return Response(QuotationSerializer(q).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='versions')
    def versions(self, request, pk=None):
        """Get all versions of this quotation (including itself)."""
        q = self.get_object()
        # Find the root (original) quotation
        root = q
        while root.parent:
            root = root.parent
        # Get all versions: root + all revisions
        all_versions = [root] + list(Quotation.objects.filter(parent=root).order_by('version'))
        # Also check if current q has revisions
        revisions_of_q = list(Quotation.objects.filter(parent=q).order_by('version'))
        all_ids = set([root.id] + [r.id for r in all_versions] + [r.id for r in revisions_of_q] + [q.id])
        all_qs = Quotation.objects.filter(id__in=all_ids).order_by('version')
        return Response(QuotationSerializer(all_qs, many=True).data)

    @action(detail=True, methods=['post'], url_path='attach-to-email')
    def attach_to_email(self, request, pk=None):
        """Generate the quotation PDF and attach it to the source email's
        AI Draft. Creates a draft for the source communication if one doesn't
        exist yet. Returns the source communication id so the frontend can
        navigate the user to the AI Draft modal.

        This is the "Attach to Email" flow used from the Inquiries page —
        replaces the older send-to-client flow which directly mailed the PDF.
        The user wanted the PDF to land in the draft so they can review the
        full email body + attachment before clicking Send Reply themselves.
        """
        from communications.models import (
            Communication, EmailDraft, DraftAttachment, QuoteRequest,
        )
        from django.core.files.base import ContentFile
        from .quotation_service import generate_quotation_pdf

        q = self.get_object()

        # Find the source communication via QuoteRequest. If none exists fall
        # back to the latest inbound mail for the client.
        qr = QuoteRequest.objects.filter(linked_quotation=q).first()
        comm = None
        if qr and qr.source_communication_id:
            comm = Communication.objects.filter(id=qr.source_communication_id).first()
        if not comm and q.client_id:
            comm = Communication.objects.filter(
                client_id=q.client_id,
                comm_type='email', direction='inbound', is_deleted=False,
            ).order_by('-created_at').first()
        if not comm:
            return Response(
                {'error': 'No source email found to attach to'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Find or create the draft for this communication
        draft = EmailDraft.objects.filter(
            communication=comm, status='draft'
        ).order_by('-updated_at').first()

        # Generate an AI body that references the freshly-attached quotation
        # so the user lands in the modal with a ready-to-review reply instead
        # of an empty body. We use the existing AI service which handles
        # quote/PI/sample intent detection automatically. If AI fails for any
        # reason we fall back to a static template.
        ai_subject = f'Re: {comm.subject}' if comm.subject else 'Re: Your Quotation Request'
        ai_body = ''
        try:
            from communications.ai_email_service import generate_email_reply
            reply = generate_email_reply(comm)
            if reply:
                ai_subject = reply.get('subject') or ai_subject
                ai_body = reply.get('body') or ''
        except Exception:
            pass

        if not ai_body:
            # Static fallback referencing the quote so the body is never blank
            client_name = comm.client.company_name if comm.client_id and comm.client else 'Valued Customer'
            ai_body = (
                f'<p>Dear {client_name},</p>'
                f'<p>Thank you for your inquiry. Please find attached our quotation '
                f'<strong>{q.quotation_number}</strong> for your review.</p>'
                f'<p>The quotation includes the product details, pricing, and terms. '
                f'Kindly review and let us know if you have any questions or require any modifications.</p>'
                f'<p>We look forward to your confirmation.</p>'
                f'<p>Best regards,<br/>{request.user.full_name or request.user.username}</p>'
            )

        if not draft:
            # Resolve the recipient — the original sender of the inbound
            # email. Falls back to the client's primary contact if the
            # external_email field is empty.
            to_email = comm.external_email or ''
            if not to_email and comm.client_id:
                from clients.models import Contact
                primary = Contact.objects.filter(
                    client_id=comm.client_id, is_primary=True
                ).first() or Contact.objects.filter(client_id=comm.client_id).first()
                if primary and primary.email:
                    to_email = primary.email

            # Create a fresh draft pre-populated with the AI body so the user
            # doesn't have to click Generate inside the modal.
            draft = EmailDraft.objects.create(
                communication=comm,
                to_email=to_email,
                subject=ai_subject,
                body=ai_body,
                cc='',
                status='draft',
                created_by=request.user,
                edited_by=request.user,
            )
        else:
            update_fields = []
            # Backfill to_email if it's blank on an existing draft
            if not (draft.to_email or '').strip():
                fallback_to = comm.external_email or ''
                if not fallback_to and comm.client_id:
                    from clients.models import Contact
                    primary = Contact.objects.filter(
                        client_id=comm.client_id, is_primary=True
                    ).first() or Contact.objects.filter(client_id=comm.client_id).first()
                    if primary and primary.email:
                        fallback_to = primary.email
                if fallback_to:
                    draft.to_email = fallback_to
                    update_fields.append('to_email')
            # Existing draft is empty — fill it in with the AI body so the
            # user has something to review when they land in the modal.
            if not (draft.body or '').strip():
                if not draft.subject:
                    draft.subject = ai_subject
                    update_fields.append('subject')
                draft.body = ai_body
                update_fields.append('body')
            if update_fields:
                draft.edited_by = request.user
                update_fields.append('edited_by')
                update_fields.append('updated_at')
                draft.save(update_fields=update_fields)

        # Generate PDF and attach (replaces any previous Quotation_ attachment
        # for this draft so the latest revision is what gets sent).
        pdf_buffer = generate_quotation_pdf(q)
        pdf_bytes = pdf_buffer.read() if hasattr(pdf_buffer, 'read') else pdf_buffer
        filename = f'Quotation_{q.quotation_number.replace("/", "-")}.pdf'

        DraftAttachment.objects.filter(
            draft=draft, filename__startswith='Quotation_'
        ).delete()

        att = DraftAttachment(draft=draft, filename=filename, file_size=len(pdf_bytes))
        att.file.save(filename, ContentFile(pdf_bytes), save=True)

        return Response({
            'status': 'attached',
            'communication_id': str(comm.id),
            'client_id': str(comm.client_id) if comm.client_id else None,
            'draft_id': str(draft.id),
            'filename': filename,
        })

    @action(detail=True, methods=['post'], url_path='save-with-items')
    def save_with_items(self, request, pk=None):
        """Save quotation fields + replace all items in one request."""
        q = self.get_object()
        data = dict(request.data)
        items_data = data.pop('items', None)

        # Fields that can be updated on Quotation
        allowed = {
            'currency', 'delivery_terms', 'payment_terms', 'payment_terms_detail',
            'freight_terms', 'country_of_origin', 'country_of_final_destination',
            'port_of_loading', 'port_of_discharge', 'vessel_flight_no',
            'final_destination', 'packaging_details', 'display_overrides',
            'validity_days', 'notes',
        }
        for field in allowed:
            if field in data:
                setattr(q, field, data[field])

        # Replace items
        if items_data is not None:
            q.items.all().delete()
            total = 0
            for item_data in items_data:
                qty = float(item_data.get('quantity', 0) or 0)
                price = float(item_data.get('unit_price', 0) or 0)
                line_total = qty * price
                total += line_total
                QuotationItem.objects.create(
                    quotation=q,
                    product_name=item_data.get('product_name', ''),
                    client_product_name=item_data.get('client_product_name', ''),
                    description=item_data.get('description', ''),
                    quantity=qty,
                    unit=item_data.get('unit', 'KG'),
                    unit_price=price,
                    total_price=line_total,
                )
            q.subtotal = total
            q.total = total

        q.save()
        return Response(QuotationSerializer(q).data)

    @action(detail=True, methods=['post'])
    def submit_for_approval(self, request, pk=None):
        q = self.get_object()
        q.status = 'pending_approval'
        q.save()
        notify(
            title=f'Quotation {q.quotation_number} pending approval',
            message=f'{request.user.full_name} submitted quotation {q.quotation_number} for {q.client.company_name} for approval.',
            notification_type='approval', link='/quotations',
            actor=request.user, client=q.client,
        )
        return Response(QuotationSerializer(q).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        q = self.get_object()
        if request.user.role not in ['admin', 'manager']:
            return Response({'error': 'Not authorized'}, status=status.HTTP_403_FORBIDDEN)
        q.status = 'approved'
        q.approved_by = request.user
        q.approved_at = timezone.now()
        q.save()
        notify(
            title=f'Quotation {q.quotation_number} approved',
            message=f'Quotation {q.quotation_number} for {q.client.company_name} approved by {request.user.full_name}.',
            notification_type='approval', link='/quotations',
            actor=request.user, client=q.client,
            extra_users=[q.created_by] if q.created_by else [],
        )
        return Response(QuotationSerializer(q).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        q = self.get_object()
        q.status = 'rejected'
        q.save()
        notify(
            title=f'Quotation {q.quotation_number} rejected',
            message=f'Quotation {q.quotation_number} for {q.client.company_name} was rejected by {request.user.full_name}.',
            notification_type='alert', link='/quotations',
            actor=request.user, client=q.client,
            extra_users=[q.created_by] if q.created_by else [],
        )
        return Response(QuotationSerializer(q).data)

    @action(detail=False, methods=['post'], url_path='create-from-order')
    def create_from_order(self, request):
        """Create a Quotation from an order, auto-filling client/items."""
        order_id = request.data.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        from .models import generate_quotation_number
        total = sum(i.total_price for i in order.items.all())
        client = order.client
        q = Quotation.objects.create(
            quotation_number=generate_quotation_number(),
            client=client,
            currency=order.currency,
            delivery_terms=order.delivery_terms or 'FOB',
            payment_terms=order.payment_terms if order.payment_terms in dict(Quotation.PAYMENT_CHOICES) else 'advance',
            freight_terms=order.freight_terms if order.freight_terms in dict(Quotation.FREIGHT_CHOICES) else 'sea_fcl',
            country_of_origin='India',
            country_of_final_destination=client.country or '',
            subtotal=total,
            total=total,
            created_by=request.user,
        )
        for item in order.items.all():
            QuotationItem.objects.create(
                quotation=q,
                product=item.product,
                product_name=item.product_name,
                description=item.description or '',
                quantity=item.quantity,
                unit=item.unit,
                unit_price=item.unit_price,
                total_price=item.total_price,
            )
        return Response(QuotationSerializer(q).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='generate-pdf')
    def generate_pdf(self, request, pk=None):
        """Generate and return Quotation PDF."""
        q = self.get_object()
        from .quotation_service import generate_quotation_pdf
        pdf_buffer = generate_quotation_pdf(q)
        client_name = q.client.company_name if q.client else 'Client'
        filename = f'Quotation_{q.quotation_number.replace("/", "-")}_{client_name.replace(" ", "_")}.pdf'
        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        return response

    @action(detail=True, methods=['post'])
    def generate_pi(self, request, pk=None):
        """Generate a Proforma Invoice from an approved quotation."""
        q = self.get_object()
        if q.status not in ['approved', 'sent']:
            return Response({'error': 'Quotation must be approved first'}, status=status.HTTP_400_BAD_REQUEST)

        from finance.models import Invoice, InvoiceItem

        # Default bank details (can be made configurable via settings)
        default_bank_details = (
            "Bank Name: State Bank of India\n"
            "Account Name: Kriya Biosys Private Limited\n"
            "Account Number: 39876543210\n"
            "IFSC Code: SBIN0001234\n"
            "SWIFT Code: SBININBB\n"
            "Branch: Export Division, Mumbai"
        )

        inv_count = Invoice.objects.count() + 1
        pi = Invoice.objects.create(
            invoice_number=f'PI-{inv_count:05d}',
            quotation=q,
            client=q.client,
            invoice_type='proforma',
            currency=q.currency,
            delivery_terms=q.delivery_terms,
            payment_terms=q.notes.split('\n')[0].replace('Payment Terms: ', '') if q.notes.startswith('Payment Terms:') else 'TT 30 days',
            validity=f'{q.validity_days} days',
            subtotal=q.subtotal,
            tax=0,
            total=q.total,
            bank_details=default_bank_details,
            notes=f'Generated from quotation {q.quotation_number}',
            created_by=request.user,
        )

        # Copy line items from quotation to PI
        for qi in q.items.all():
            InvoiceItem.objects.create(
                invoice=pi,
                product_name=qi.product_name,
                description=qi.description,
                quantity=qi.quantity,
                unit=qi.unit,
                unit_price=qi.unit_price,
                total_price=qi.total_price,
            )

        # Update quotation status to sent
        q.status = 'sent'
        q.save()

        notify(
            title=f'PI {pi.invoice_number} generated',
            message=f'Proforma Invoice generated from quotation {q.quotation_number} for {q.client.company_name}.',
            notification_type='system', link='/proforma-invoices',
            actor=request.user, client=q.client,
            extra_users=[q.created_by] if q.created_by else [],
        )

        from finance.serializers import InvoiceSerializer
        return Response(InvoiceSerializer(pi).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def convert_to_order(self, request, pk=None):
        q = self.get_object()
        if q.status != 'approved':
            return Response({'error': 'Must be approved first'}, status=status.HTTP_400_BAD_REQUEST)
        order_count = Order.objects.count() + 1
        order = Order.objects.create(
            order_number=f'ORD-{order_count:05d}',
            client=q.client, quotation=q, currency=q.currency,
            delivery_terms=q.delivery_terms, total=q.total, created_by=request.user,
            payment_terms=q.payment_terms or q.payment_terms_detail or '',
            freight_terms=q.freight_terms or '',
        )
        for qi in q.items.all():
            OrderItem.objects.create(
                order=order, product=qi.product, product_name=qi.product_name,
                client_product_name=qi.client_product_name,
                description=qi.description, quantity=qi.quantity, unit=qi.unit,
                unit_price=qi.unit_price, total_price=qi.total_price
            )
        q.status = 'accepted'
        q.save()
        if q.inquiry:
            q.inquiry.stage = 'order_confirmed'
            q.inquiry.save()
        inv_count = Invoice.objects.count() + 1
        pi = Invoice.objects.create(
            invoice_number=f'PI-{inv_count:05d}', order=order, client=q.client,
            invoice_type='proforma', currency=q.currency, subtotal=q.subtotal,
            total=q.total, created_by=request.user
        )
        # Create a Document record for the Proforma Invoice
        from documents.models import Document
        Document.objects.create(
            client=q.client,
            order=order,
            name=f'Proforma Invoice - {pi.invoice_number}',
            category='financial',
            file=f'documents/auto/PI-{pi.invoice_number}.pdf',
            filename=f'PI-{pi.invoice_number}.pdf',
            mime_type='application/pdf',
            file_size=0,
            uploaded_by=request.user,
        )
        notify(
            title=f'Order {order.order_number} created from {q.quotation_number}',
            message=f'Quotation converted to order by {request.user.full_name}. PI {pi.invoice_number} generated.',
            notification_type='system', link=f'/sales-orders',
            actor=request.user, client=q.client,
            extra_users=[q.created_by] if q.created_by else [],
        )
        return Response({'order_id': str(order.id), 'order_number': order.order_number}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='send-to-client')
    def send_to_client(self, request, pk=None):
        """Send quotation/PI to client via email or WhatsApp."""
        q = self.get_object()
        send_via = request.data.get('send_via', 'email')  # email or whatsapp
        include_pi = request.data.get('include_pi', False)

        if q.status not in ['approved', 'sent', 'pending_approval', 'draft']:
            return Response({'error': 'Quotation cannot be sent in this status'}, status=status.HTTP_400_BAD_REQUEST)

        if send_via == 'email':
            # Determine recipient: use quote requester's email if available, else primary contact
            from communications.services import get_client_email_recipients
            contact_email, contact, cc_string = get_client_email_recipients(q.client, source_quotation=q)
            if not contact_email:
                return Response({'error': 'Client has no contacts with email. Add a contact first.'}, status=status.HTTP_400_BAD_REQUEST)

            from communications.models import EmailAccount
            email_account = EmailAccount.objects.filter(user=request.user, is_active=True).first()
            if not email_account:
                email_account = EmailAccount.objects.filter(is_active=True).first()
            if not email_account:
                return Response({'error': 'No email account configured. Go to Settings > Email Accounts.'}, status=status.HTTP_400_BAD_REQUEST)

            # Build email
            items_html = ''
            for i, item in enumerate(q.items.all(), 1):
                details = item.description if item.description else f'{item.quantity:,.0f} {item.unit}'
                items_html += f'<tr><td style="padding:8px;border:1px solid #eee;">{i}</td><td style="padding:8px;border:1px solid #eee;">{item.product_name}</td><td style="padding:8px;border:1px solid #eee;">{details}</td><td style="padding:8px;border:1px solid #eee;text-align:right;">{q.currency} {item.unit_price:,.2f}</td><td style="padding:8px;border:1px solid #eee;text-align:right;">{q.currency} {item.total_price:,.2f}</td></tr>'

            payment_display = q.payment_terms_detail or (q.get_payment_terms_display() if q.payment_terms else 'As agreed')
            delivery_display = q.get_delivery_terms_display() if q.delivery_terms else ''

            body_html = f"""
            <div style="font-family:Arial,sans-serif;max-width:700px;">
                <h2 style="color:#4a7c2e;">Quotation - {q.quotation_number}</h2>
                <p>Dear {contact.name},</p>
                <p>Please find attached our quotation for your reference:</p>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <tr><td style="padding:6px;color:#666;width:140px;">Quotation No.</td><td style="padding:6px;font-weight:bold;">{q.quotation_number}</td></tr>
                    <tr><td style="padding:6px;color:#666;">Delivery Terms</td><td style="padding:6px;">{delivery_display}</td></tr>
                    <tr><td style="padding:6px;color:#666;">Payment Terms</td><td style="padding:6px;">{payment_display}</td></tr>
                    <tr><td style="padding:6px;color:#666;">Freight</td><td style="padding:6px;">{q.get_freight_terms_display() if q.freight_terms else 'To be discussed'}</td></tr>
                    <tr><td style="padding:6px;color:#666;">Validity</td><td style="padding:6px;">{q.validity_days} days</td></tr>
                </table>
                <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                    <tr style="background:#4a7c2e;color:white;"><th style="padding:8px;text-align:left;">#</th><th style="padding:8px;text-align:left;">Product</th><th style="padding:8px;text-align:left;">Details</th><th style="padding:8px;text-align:right;">Unit Price</th><th style="padding:8px;text-align:right;">Total</th></tr>
                    {items_html}
                    <tr style="font-weight:bold;background:#f5f5f5;"><td colspan="4" style="padding:8px;text-align:right;">Total:</td><td style="padding:8px;text-align:right;">{q.currency} {q.total:,.2f}</td></tr>
                </table>
                {f'<p>{q.notes}</p>' if q.notes else ''}
                <p>Please confirm your acceptance or let us know if you need any modifications.</p>
                <p>Best regards,<br/><b>Kriya Biosys Private Limited</b><br/><i>"Go Organic! Save Planet!"</i></p>
            </div>
            """

            # Generate PDF attachment
            from .quotation_service import generate_quotation_pdf
            from io import BytesIO
            pdf_buffer = generate_quotation_pdf(q)
            pdf_bytes = pdf_buffer.read()
            pdf_file = BytesIO(pdf_bytes)
            pdf_file.name = f'Quotation_{q.quotation_number.replace("/", "-")}.pdf'

            from communications.services import EmailService
            try:
                EmailService.send_email(
                    email_account=email_account,
                    to=contact_email,
                    subject=f'Quotation {q.quotation_number} - Kriya Biosys',
                    body_html=body_html,
                    attachments=[pdf_file],
                    cc=cc_string or None,
                )
            except Exception as e:
                return Response({'error': f'Failed to send email: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # Log communication
            from communications.models import Communication
            Communication.objects.create(
                client=q.client, contact=contact, user=request.user,
                comm_type='email', direction='outbound',
                subject=f'Quotation {q.quotation_number}', body=body_html,
                status='sent', email_account=email_account, external_email=contact_email,
                email_cc=cc_string,
            )

        q.sent_via = send_via
        q.sent_at = timezone.now()
        if q.status in ['approved', 'draft', 'pending_approval']:
            q.status = 'sent'
        q.save()

        notify(
            title=f'Quotation {q.quotation_number} sent to {q.client.company_name}',
            message=f'{request.user.full_name} sent quotation via {send_via}.',
            notification_type='system', link='/quotations',
            actor=request.user, client=q.client,
            extra_users=[q.created_by] if q.created_by else [],
        )

        # Auto-update client price list from quotation items
        from clients.models import ClientPriceList
        for item in q.items.all():
            if not item.product_name:
                continue
            existing = ClientPriceList.objects.filter(
                client=q.client, product_name=item.product_name, is_deleted=False,
            ).first()
            if existing:
                if existing.unit_price != item.unit_price:
                    existing.unit_price = item.unit_price
                    existing.currency = q.currency
                    existing.save(update_fields=['unit_price', 'currency', 'updated_at'])
            else:
                ClientPriceList.objects.create(
                    client=q.client, product=item.product,
                    product_name=item.product_name,
                    client_product_name=item.client_product_name or '',
                    unit_price=item.unit_price,
                    currency=q.currency, unit=item.unit,
                )

        return Response({'status': 'sent', 'sent_via': send_via})
