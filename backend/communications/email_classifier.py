"""
Email classification service.

Classifies incoming emails into categories:
  - client: known client email / business inquiry
  - promotion: marketing, sales, offers
  - update: receipts, system notifications, vendor invoices
  - social: LinkedIn, Facebook, Twitter, Instagram
  - spam: suspicious / unknown marketing
  - unknown: cannot determine
"""
import re
import logging

logger = logging.getLogger(__name__)

# ── Keyword / pattern sets ──────────────────────────────────────────────

PROMOTION_PATTERNS = [
    r'\b(unsubscribe)\b',
    r'\b(sale|offer|discount|deal|promo|coupon|voucher)\b',
    r'\b(limited.?time|act\s*now|hurry|exclusive\s*offer)\b',
    r'\b(free\s*trial|free\s*shipping|buy\s*one|clearance)\b',
    r'\b(newsletter|marketing|campaign|bulk\s*email)\b',
    r'\b(click\s*here\s*to\s*unsubscribe)\b',
    r'\b(special\s*price|best\s*deal|lowest\s*price)\b',
]

UPDATE_PATTERNS = [
    r'\b(receipt|invoice|payment\s*(received|confirmed|processed))\b',
    r'\b(order\s*(confirmed|shipped|delivered|dispatched))\b',
    r'\b(notification|alert|reminder|update)\b',
    r'\b(password\s*(reset|changed|expired))\b',
    r'\b(account\s*(update|activity|statement))\b',
    r'\b(verification\s*code|otp|two.?factor)\b',
    r'\b(subscription\s*(renewed|expir|cancel))\b',
    r'\bnoreply@\b',
    r'\bno-reply@\b',
    r'\bmailer-daemon@\b',
    r'\bpostmaster@\b',
    r'\b(delivery\s*status\s*notification)\b',
    r'\b(auto.?generated|do\s*not\s*reply)\b',
]

SOCIAL_DOMAINS = [
    'linkedin.com', 'facebookmail.com', 'facebook.com',
    'twitter.com', 'x.com', 'instagram.com',
    'pinterest.com', 'tiktok.com', 'reddit.com',
    'quora.com', 'medium.com', 'github.com',
    'notifications.google.com',
]

SOCIAL_PATTERNS = [
    r'\b(linkedin|facebook|twitter|instagram|tiktok)\b',
    r'\b(connection\s*request|endorsed|mentioned\s*you)\b',
    r'\b(new\s*follower|liked\s*your|commented\s*on\s*your)\b',
    r'\b(social\s*network|profile\s*view)\b',
]

SPAM_PATTERNS = [
    r'\b(viagra|cialis|pharmacy|pills)\b',
    r'\b(winner|lottery|prize|congratulations.*won)\b',
    r'\b(nigerian|prince|inheritance|million\s*dollars)\b',
    r'\b(bitcoin|crypto.*invest|guaranteed\s*return)\b',
    r'\b(weight\s*loss|miracle\s*cure|anti.?aging)\b',
    r'\b(click\s*below|claim\s*your|verify\s*your\s*account\s*immediately)\b',
]

# Domains that are almost never client emails
KNOWN_NONCLIENT_DOMAINS = [
    'noreply', 'no-reply', 'mailer-daemon', 'postmaster',
    'notifications', 'marketing', 'promo', 'news', 'info',
    'support', 'newsletter', 'updates', 'alerts',
]


def classify_email(sender_email, subject, body, client_matched=False, contact_matched=False):
    """
    Classify an email and return classification result.

    Args:
        sender_email: The sender's email address
        subject: Email subject line
        body: Email body (plain text or HTML stripped)
        client_matched: True if ContactMatcher already found a client
        contact_matched: True if ContactMatcher found a contact

    Returns:
        dict: {
            'is_client_mail': bool,
            'classification': str  ('client'|'promotion'|'update'|'social'|'spam'|'unknown')
        }
    """
    # ── Rule 1: If already matched to a client → client mail ──
    if client_matched or contact_matched:
        return {'is_client_mail': True, 'classification': 'client'}

    sender_lower = (sender_email or '').lower()
    subject_lower = (subject or '').lower()

    # Strip HTML tags from body for pattern matching
    body_clean = re.sub(r'<[^>]+>', ' ', body or '')
    body_lower = body_clean.lower()

    # Combined text for matching
    combined = f"{subject_lower} {body_lower}"

    domain = sender_lower.split('@')[-1] if '@' in sender_lower else ''
    local_part = sender_lower.split('@')[0] if '@' in sender_lower else ''

    # ── Rule 2: Social media domains ──
    if any(sd in domain for sd in SOCIAL_DOMAINS):
        return {'is_client_mail': False, 'classification': 'social'}

    # ── Rule 3: Score-based classification ──
    scores = {
        'promotion': 0,
        'update': 0,
        'social': 0,
        'spam': 0,
    }

    for pattern in PROMOTION_PATTERNS:
        if re.search(pattern, combined, re.IGNORECASE):
            scores['promotion'] += 1

    for pattern in UPDATE_PATTERNS:
        if re.search(pattern, combined, re.IGNORECASE):
            scores['update'] += 1

    # Check sender local part for noreply-style addresses
    if any(nc in local_part for nc in KNOWN_NONCLIENT_DOMAINS):
        scores['update'] += 2

    # mailer-daemon is always an update (delivery failure)
    if 'mailer-daemon' in sender_lower:
        return {'is_client_mail': False, 'classification': 'update'}

    for pattern in SOCIAL_PATTERNS:
        if re.search(pattern, combined, re.IGNORECASE):
            scores['social'] += 1

    for pattern in SPAM_PATTERNS:
        if re.search(pattern, combined, re.IGNORECASE):
            scores['spam'] += 2  # weight spam higher

    # ── Determine winner ──
    max_category = max(scores, key=scores.get)
    max_score = scores[max_category]

    if max_score >= 2:
        return {'is_client_mail': False, 'classification': max_category}

    # If score is 1 in promotion/update but nothing else, still classify
    if max_score == 1 and scores[max_category] > 0:
        # Only if no other category also scored 1
        tied = [k for k, v in scores.items() if v == max_score]
        if len(tied) == 1:
            return {'is_client_mail': False, 'classification': max_category}

    # ── Rule 4: No match and no client → unknown (goes to unmatched) ──
    return {'is_client_mail': False, 'classification': 'unknown'}


def reclassify_communication(communication):
    """Re-run classification on an existing communication."""
    from .services import ContactMatcher

    client_matched = communication.client is not None
    contact_matched = communication.contact is not None

    result = classify_email(
        sender_email=communication.external_email,
        subject=communication.subject,
        body=communication.body,
        client_matched=client_matched,
        contact_matched=contact_matched,
    )

    communication.is_client_mail = result['is_client_mail']
    communication.classification = result['classification']
    communication.is_classified = True
    communication.save(update_fields=['is_client_mail', 'classification', 'is_classified'])
    return result
