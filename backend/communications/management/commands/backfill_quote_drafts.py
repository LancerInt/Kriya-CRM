"""
Backfill quote requests, auto-created products, and attached quotations for
EXISTING inbound emails.

For every inbound Communication (or only those without a linked QuoteRequest),
this:
  1. Runs the quote-intent detector + AI extractor.
  2. Auto-creates the Product in the master list if it isn't already there.
  3. Creates the QuoteRequest + draft Quotation (so the AI Draft modal sees it).
  4. Attaches the Quotation PDF to the existing EmailDraft if one exists.

Usage:
    python manage.py backfill_quote_drafts                 # process all eligible
    python manage.py backfill_quote_drafts --client <id>   # one client only
    python manage.py backfill_quote_drafts --limit 50      # cap how many
    python manage.py backfill_quote_drafts --dry-run       # report only
"""
from django.core.management.base import BaseCommand
from django.db import transaction


class Command(BaseCommand):
    help = 'Backfill auto-quote pipeline (products + quotations + draft attachments) for existing inbound emails.'

    def add_arguments(self, parser):
        parser.add_argument('--client', type=str, default=None,
                            help='Restrict to a single client ID')
        parser.add_argument('--limit', type=int, default=None,
                            help='Maximum number of communications to process')
        parser.add_argument('--dry-run', action='store_true',
                            help='Report what would be done without writing')
        parser.add_argument('--reattach', action='store_true',
                            help='Re-attach Quotation PDF to drafts even if one already exists')

    def handle(self, *args, **opts):
        from communications.models import Communication, EmailDraft, QuoteRequest, DraftAttachment
        from communications.auto_quote_service import process_communication_for_quote
        from quotations.quotation_service import generate_quotation_pdf
        from django.core.files.base import ContentFile

        qs = Communication.objects.filter(
            comm_type='email', direction='inbound', is_deleted=False
        ).order_by('-created_at')

        if opts['client']:
            qs = qs.filter(client_id=opts['client'])

        # Skip those that already have a linked QuoteRequest with a quotation
        already_done_ids = set(
            QuoteRequest.objects.filter(
                source_communication__in=qs, linked_quotation__isnull=False,
            ).values_list('source_communication_id', flat=True)
        )
        targets = [c for c in qs if c.id not in already_done_ids]

        if opts['limit']:
            targets = targets[:opts['limit']]

        self.stdout.write(self.style.NOTICE(
            f'Found {len(targets)} inbound emails to process '
            f'(skipped {len(already_done_ids)} already linked).'
        ))

        processed = 0
        attached = 0
        skipped = 0
        errors = 0

        for comm in targets:
            try:
                if opts['dry_run']:
                    self.stdout.write(f'  [dry-run] would process: {comm.id} — {comm.subject[:60]}')
                    processed += 1
                    continue

                with transaction.atomic():
                    qr = process_communication_for_quote(comm)
                    if not qr:
                        skipped += 1
                        continue
                    processed += 1

                    if not qr.linked_quotation:
                        continue

                    # Attach the Quotation PDF to the existing AI draft (if any)
                    draft = EmailDraft.objects.filter(communication=comm).first()
                    if not draft:
                        continue

                    has_quote_attachment = draft.attachments.filter(
                        filename__icontains='Quotation_'
                    ).exists()
                    if has_quote_attachment and not opts['reattach']:
                        continue

                    pdf_buffer = generate_quotation_pdf(qr.linked_quotation)
                    pdf_bytes = pdf_buffer.read()
                    filename = f'Quotation_{qr.linked_quotation.quotation_number.replace("/", "-")}.pdf'
                    att = DraftAttachment(draft=draft, filename=filename, file_size=len(pdf_bytes))
                    att.file.save(filename, ContentFile(pdf_bytes), save=True)
                    attached += 1

            except Exception as e:
                errors += 1
                self.stdout.write(self.style.ERROR(
                    f'  ! Failed on comm {comm.id}: {e}'
                ))

        self.stdout.write(self.style.SUCCESS(
            f'Done. processed={processed} attached={attached} '
            f'skipped(no-intent)={skipped} errors={errors}'
        ))
