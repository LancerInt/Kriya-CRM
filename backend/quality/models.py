from django.db import models
from common.models import TimeStampedModel


class Inspection(TimeStampedModel):
    class Type(models.TextChoices):
        PRE_DISPATCH = 'pre_dispatch', 'Pre-Dispatch'
        CONTAINER_LOADING = 'container_loading', 'Container Loading'
        THIRD_PARTY = 'third_party', 'Third Party'

    class Status(models.TextChoices):
        PASSED = 'passed', 'Passed'
        CONDITIONAL = 'conditional', 'Conditional'
        FAILED = 'failed', 'Failed'
        PENDING = 'pending', 'Pending'

    shipment = models.ForeignKey('shipments.Shipment', on_delete=models.CASCADE, related_name='inspections')
    inspection_date = models.DateField()
    inspector_name = models.CharField(max_length=255)
    inspection_type = models.CharField(max_length=30, choices=Type.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'inspections'


class InspectionMedia(models.Model):
    id = models.AutoField(primary_key=True)
    inspection = models.ForeignKey(Inspection, on_delete=models.CASCADE, related_name='media')
    file = models.FileField(upload_to='inspections/%Y/%m/')
    media_type = models.CharField(max_length=20, default='photo')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inspection_media'


class COADocument(TimeStampedModel):
    shipment = models.ForeignKey('shipments.Shipment', on_delete=models.CASCADE, null=True, blank=True, related_name='coa_documents')
    product = models.ForeignKey('products.Product', on_delete=models.SET_NULL, null=True, blank=True)
    coa_type = models.CharField(max_length=20, default='lab', help_text='lab or client')
    file = models.FileField(upload_to='coa/%Y/%m/')
    version = models.IntegerField(default=1)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'coa_documents'


class COAReportCounter(models.Model):
    """Tracks the next sequence number for COA report numbers per year-month.
    Format: KB/YYMM/SEQ  e.g. KB/2604/001
    A sequence is only consumed when a COA is actually sent (email/whatsapp).
    """
    year_month = models.CharField(max_length=4, unique=True, help_text='YYMM e.g. 2604')
    last_sequence = models.IntegerField(default=0)

    class Meta:
        db_table = 'coa_report_counters'

    @classmethod
    def get_next_report_number(cls):
        """Return the next report number without consuming it (preview only)."""
        from django.utils import timezone
        now = timezone.now()
        ym = now.strftime('%y%m')  # e.g. '2604' for 2026-April
        counter, _ = cls.objects.get_or_create(year_month=ym, defaults={'last_sequence': 0})
        next_seq = counter.last_sequence + 1
        return f'KB/{ym}/{next_seq:03d}'

    @classmethod
    def consume_next_report_number(cls, report_no=None):
        """Consume and return the next report number. If report_no is provided
        and matches the expected format for the current month, use that and
        update the counter to at least that sequence."""
        from django.utils import timezone
        import re
        now = timezone.now()
        ym = now.strftime('%y%m')
        counter, _ = cls.objects.select_for_update().get_or_create(
            year_month=ym, defaults={'last_sequence': 0}
        )
        # If a custom report_no was provided, try to extract the seq from it
        if report_no:
            m = re.match(r'^KB/' + ym + r'/(\d+)$', report_no)
            if m:
                seq = int(m.group(1))
                if seq > counter.last_sequence:
                    counter.last_sequence = seq
                    counter.save()
                return report_no
            # Custom format that doesn't match — just return as-is (user edited it)
            return report_no
        # Auto-generate
        counter.last_sequence += 1
        counter.save()
        return f'KB/{ym}/{counter.last_sequence:03d}'
