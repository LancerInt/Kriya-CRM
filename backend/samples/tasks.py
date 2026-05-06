"""
Periodic Celery tasks for the Samples app.
"""
import logging
import threading
from celery import shared_task

logger = logging.getLogger(__name__)


# Threshold for the post-reply reminder (matches the periodic Celery task).
REMINDER_DELAY_SECONDS = 2 * 60  # 2 minutes
# Threshold for the post-delivery feedback reminder.
# 1.5 months (45 days) — the inline threading.Timer set up at delivery
# time will not survive a process restart over this window, which is fine
# because the periodic Celery beat task `check_sample_feedback_reminders`
# scans every minute and fires the reminder once delivered_at crosses
# this threshold.
FEEDBACK_REMINDER_DELAY_SECONDS = 45 * 24 * 60 * 60  # 1.5 months


def schedule_sample_reply_reminder(sample_id):
    """Schedule a one-shot reminder N seconds from now using threading.Timer.

    Used inline by EmailDraft.send so the reminder fires even when Celery
    Beat isn't running. The fired callback re-loads the sample and only
    notifies if status is STILL 'requested' (i.e., the executive hasn't
    progressed the workflow in the meantime).
    """
    def _fire():
        try:
            # Local imports so the timer thread doesn't hold module-level
            # references that could break on Django auto-reload.
            import django
            django.setup()
            from .models import Sample
            from notifications.helpers import notify
            from django.utils import timezone

            sample = Sample.objects.filter(
                id=sample_id, is_deleted=False
            ).select_related('client', 'created_by').first()
            if not sample:
                return
            if sample.status != Sample.Status.REQUESTED:
                return  # status was advanced — no reminder needed
            if sample.reminder_sent_at:
                return  # already reminded
            if not sample.replied_at:
                return  # somehow not replied — skip

            client_name = sample.client.company_name if sample.client else 'Unknown client'
            product = sample.product_name or sample.client_product_name or '(no product)'
            notify(
                title=f'Sample reminder: {product}',
                message=(
                    f'You replied to {client_name} for the {product} sample request, '
                    f'but the sample has not been prepared yet. Please update the status.'
                ),
                notification_type='reminder',
                link=f'/samples/{sample.id}',
                client=sample.client,
                extra_users=[sample.created_by] if sample.created_by else None,
            )
            sample.reminder_sent_at = timezone.now()
            sample.save(update_fields=['reminder_sent_at'])
            logger.info(f'Inline sample reminder fired for {sample.id}')
        except Exception as e:
            logger.warning(f'Inline sample reminder failed for {sample_id}: {e}')

    t = threading.Timer(REMINDER_DELAY_SECONDS, _fire)
    t.daemon = True
    t.start()


def _notify_feedback_reminder(sample):
    """Build and send the post-delivery feedback reminder notification.

    Routed via notify() which automatically reaches the client's primary
    executive (the assigned account owner) and any admin/manager users
    subscribed to the sample. The sample's creator is added explicitly via
    extra_users so the executive who logged the sample also gets pinged.
    """
    from notifications.helpers import notify

    client_name = sample.client.company_name if sample.client else 'Unknown client'
    product = sample.product_name or sample.client_product_name or '(no product)'
    notify(
        title=f'Feedback pending: {product}',
        message=(
            f'The {product} sample for {client_name} was delivered. '
            f'Please follow up with the client and request feedback.'
        ),
        notification_type='reminder',
        link=f'/samples/{sample.id}',
        client=sample.client,
        extra_users=[sample.created_by] if sample.created_by else None,
    )


def schedule_sample_feedback_reminder(sample_id):
    """Schedule a one-shot post-delivery feedback reminder N seconds out.

    Mirrors the reply-reminder pattern: a threading.Timer ensures the
    reminder fires even when Celery Beat isn't running locally. The
    callback re-loads the sample and only notifies if the sample is still
    sitting at 'delivered' (the executive hasn't logged feedback yet) and
    no feedback reminder has been sent before.
    """
    def _fire():
        try:
            import django
            django.setup()
            from .models import Sample
            from django.utils import timezone

            sample = Sample.objects.filter(
                id=sample_id, is_deleted=False
            ).select_related('client', 'created_by').first()
            if not sample:
                return
            if sample.status != Sample.Status.DELIVERED:
                return  # already moved to feedback_pending / received
            if sample.feedback_reminder_sent_at:
                return  # already reminded

            _notify_feedback_reminder(sample)
            sample.feedback_reminder_sent_at = timezone.now()
            sample.save(update_fields=['feedback_reminder_sent_at'])
            logger.info(f'Inline feedback reminder fired for sample {sample.id}')
        except Exception as e:
            logger.warning(f'Inline feedback reminder failed for {sample_id}: {e}')

    t = threading.Timer(FEEDBACK_REMINDER_DELAY_SECONDS, _fire)
    t.daemon = True
    t.start()


@shared_task(name='samples.check_sample_feedback_reminders')
def check_sample_feedback_reminders():
    """Periodic backstop for ``schedule_sample_feedback_reminder``.

    Finds samples that have been in ``delivered`` for at least the
    threshold and haven't received a feedback reminder yet, then fires
    the notification once per sample.
    """
    from datetime import timedelta
    from django.utils import timezone
    from .models import Sample

    cutoff = timezone.now() - timedelta(seconds=FEEDBACK_REMINDER_DELAY_SECONDS)
    candidates = Sample.objects.filter(
        is_deleted=False,
        delivered_at__isnull=False,
        delivered_at__lte=cutoff,
        feedback_reminder_sent_at__isnull=True,
        status=Sample.Status.DELIVERED,
    ).select_related('client', 'created_by')

    fired = 0
    for sample in candidates:
        try:
            _notify_feedback_reminder(sample)
            sample.feedback_reminder_sent_at = timezone.now()
            sample.save(update_fields=['feedback_reminder_sent_at'])
            fired += 1
        except Exception as e:
            logger.warning(f'Feedback reminder failed for sample {sample.id}: {e}')

    if fired:
        logger.info(f'Fired {fired} feedback reminders')
    return f'{fired} feedback reminders sent'


@shared_task(name='samples.check_sample_reply_reminders')
def check_sample_reply_reminders():
    """Fire a follow-up notification for samples where:

    - We sent the AI reply (replied_at is set)
    - More than the threshold time has passed since the reply
    - The sample is STILL in 'requested' status (no progress made)
    - We haven't already fired a reminder (reminder_sent_at is null)

    Notifies the assigned executive + admin/manager (via the standard
    notify() helper which routes by client.primary_executive).

    Threshold is 2 minutes for testing — bump to a longer interval like
    24 hours for production by changing REMINDER_THRESHOLD_MINUTES.
    """
    from datetime import timedelta
    from django.utils import timezone
    from notifications.helpers import notify
    from .models import Sample

    REMINDER_THRESHOLD_MINUTES = 2  # change to 24 * 60 for one day in prod
    cutoff = timezone.now() - timedelta(minutes=REMINDER_THRESHOLD_MINUTES)

    candidates = Sample.objects.filter(
        is_deleted=False,
        replied_at__isnull=False,
        replied_at__lte=cutoff,
        reminder_sent_at__isnull=True,
        status=Sample.Status.REQUESTED,
    ).select_related('client', 'created_by')

    fired = 0
    for sample in candidates:
        try:
            client_name = sample.client.company_name if sample.client else 'Unknown client'
            product = sample.product_name or sample.client_product_name or '(no product)'
            notify(
                title=f'Sample reminder: {product}',
                message=(
                    f'You replied to {client_name} for the {product} sample request, '
                    f'but the sample has not been prepared yet. Please update the status.'
                ),
                notification_type='reminder',
                link=f'/samples/{sample.id}',
                client=sample.client,
                # Notify the user who created the sample as well as admin/manager
                extra_users=[sample.created_by] if sample.created_by else None,
            )
            sample.reminder_sent_at = timezone.now()
            sample.save(update_fields=['reminder_sent_at'])
            fired += 1
        except Exception as e:
            logger.warning(f'Sample reminder failed for {sample.id}: {e}')

    if fired:
        logger.info(f'Fired {fired} sample reply reminders')
    return f'{fired} reminders sent'
