"""
Historical/backfilled-communication guard.

Communications dated on or before settings.BACKFILL_CUTOFF_DATE are treated
as historical data only. They are persisted and searchable, but no automation
should fire from them — no auto-quote, no auto-PI, no auto-PO, no AI draft,
no sample request, no auto-revision, no inbound notifications.

The email sync pipeline already overrides `Communication.created_at` with the
real send/receive timestamp from the message headers (see communications/tasks.py),
so we can compare `created_at.date()` against the cutoff directly.
"""
import logging

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def is_historical_communication(communication):
    """
    True if ``communication`` was received on or before the configured
    BACKFILL_CUTOFF_DATE. Callers should bail out of any downstream
    automation when this returns True.
    """
    cutoff = getattr(settings, 'BACKFILL_CUTOFF_DATE', None)
    if not cutoff or communication is None:
        return False
    received_at = getattr(communication, 'created_at', None)
    if not received_at:
        return False
    return timezone.localtime(received_at).date() <= cutoff
