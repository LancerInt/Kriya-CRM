"""
Email signature builder.

Generates the standard Kriya Biosys email sign-off block:

    Thanks and Regards,
    <Display Name>
    [logo]
    Kriya Biosys Private Limited
    Tel : +91 ..........
    Email : <user.email> | www.kriya.ltd

The display name comes from User.signature_name (set per user — e.g.
"Shobana C", "Moulee S", "Indra P", "Dinesh Kumar N"). Phone and email also
come from the user's signature_phone / signature_email fields when set,
otherwise we fall back to the user's primary phone / email.

The block is appended exactly once on send. We mark it with a sentinel comment
so we never double-append on regenerate / refine flows.
"""
import base64
import logging
import os
import re
from functools import lru_cache

from django.conf import settings

logger = logging.getLogger(__name__)

SIGNATURE_MARKER = '<!--kriya-signature-->'

# Content-ID used for the inline logo image. The send_email path attaches the
# logo as a related MIME part with this Content-ID, and the signature HTML
# references it as <img src="cid:kriya-logo">. Gmail and other clients strip
# data: URIs from email bodies for security, so cid: is the only reliable way
# to embed an inline image.
LOGO_CID = 'kriya-logo'


@lru_cache(maxsize=1)
def _logo_bytes():
    """Return the raw logo PNG bytes (cached). Used as a related MIME part."""
    try:
        path = os.path.join(settings.BASE_DIR, 'static', 'images', 'logo.png')
        with open(path, 'rb') as f:
            return f.read()
    except Exception as e:
        logger.warning(f'Could not load logo for signature: {e}')
        return None


@lru_cache(maxsize=1)
def _logo_data_uri():
    """Return the company logo as a base64 data: URI.

    NOTE: Most email clients (Gmail in particular) strip data: URIs from
    HTML email bodies for security. Use cid:kriya-logo for outgoing mail
    instead — this helper is kept only for places that render HTML in a
    browser (not an email client), e.g. preview popups.
    """
    raw = _logo_bytes()
    if not raw:
        return ''
    encoded = base64.b64encode(raw).decode('ascii')
    return f'data:image/png;base64,{encoded}'


def _esc(text):
    return (text or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def build_signature_html(user, *, with_thanks=True, for_email=True):
    """Return the signature block as HTML for the given user.

    `with_thanks=False` skips the "Thanks and Regards," prefix — useful when
    the body already ends with its own sign-off line and we only want to
    inject the contact card.

    NOTE: We deliberately do NOT include the logo image. Gmail (and most
    webmail clients) show any embedded `cid:` image as an attachment chip in
    the inbox preview row — even when it's marked Content-Disposition: inline
    with no filename. The only way to get a logo into the signature WITHOUT
    showing an attachment chip is to host the image at a public HTTPS URL and
    reference it as <img src="https://..."> so Gmail proxies it through its
    image cache. Until a public URL is configured, the signature is text-only.

    To re-enable the logo: set settings.SIGNATURE_LOGO_URL to a public HTTPS
    URL of the Kriya logo and we'll inject an <img src="..."> referencing it.
    """
    if not user:
        display_name = ''
        phone = ''
        email_addr = ''
    else:
        display_name = (user.signature_name or '').strip() or (user.full_name or '').strip()
        phone = (user.signature_phone or user.phone or '').strip()
        email_addr = (user.signature_email or user.email or '').strip()

    # Optional public-URL logo (works around Gmail's attachment-chip behavior).
    # Set settings.SIGNATURE_LOGO_URL = "https://your-cdn/kriya-logo.png" to enable.
    logo_url = getattr(settings, 'SIGNATURE_LOGO_URL', '') or ''
    logo_html = (
        f'<img src="{logo_url}" alt="Kriya Biosys Private Limited" '
        f'style="height:56px;width:auto;display:block;margin:8px 0;border:0;" />'
    ) if logo_url else ''

    thanks_html = '<p style="margin:0 0 4px 0;">Thanks and Regards,</p>' if with_thanks else ''
    name_html = (
        f'<p style="margin:0 0 4px 0;font-weight:600;color:#333;">{_esc(display_name)}</p>'
        if display_name else ''
    )
    # If a logo image is shown, the logo itself includes the "Kriya Biosys
    # Private Limited" wordmark — so we omit the duplicate text line. If no
    # logo is configured (text-only fallback) we keep the green company name
    # so the signature still anchors visually.
    company_html = (
        '' if logo_url
        else '<p style="margin:8px 0 0 0;font-weight:600;color:#558b2f;">Kriya Biosys Private Limited</p>'
    )
    phone_html = (
        f'<p style="margin:0;color:#555;">Tel : {_esc(phone)}</p>' if phone else ''
    )
    email_line_html = ''
    if email_addr:
        email_line_html = (
            f'<p style="margin:0;color:#555;">Email : '
            f'<a href="mailto:{_esc(email_addr)}" style="color:#1a73e8;text-decoration:none;">{_esc(email_addr)}</a>'
            f' | <a href="https://www.kriya.ltd" style="color:#1a73e8;text-decoration:none;">www.kriya.ltd</a></p>'
        )

    return (
        f'{SIGNATURE_MARKER}'
        f'<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.4;color:#333;margin-top:16px;">'
        f'{thanks_html}{name_html}{logo_html}{company_html}{phone_html}{email_line_html}'
        f'</div>'
    )


def strip_signature(body):
    """Remove an existing signature block from a body so we can re-append.

    Matches the SIGNATURE_MARKER comment and everything inside the wrapping
    <div>. Also strips legacy plain-text "Best regards,\\nKriya Biosys ..."
    blocks the AI generator used to add, so we don't end up with two
    sign-offs in the same email.
    """
    if not body:
        return ''
    s = body
    # Remove our own signed-off block (and everything after it)
    if SIGNATURE_MARKER in s:
        s = s.split(SIGNATURE_MARKER, 1)[0]
    # Remove legacy plain-text sign-offs the AI generator left behind
    s = re.sub(
        r'(?:<p[^>]*>\s*)?(Best regards|Thanks and Regards|Kind regards|Warm regards|Regards|Sincerely|Thanks|Thank you)[,.]?\s*(?:</p>)?\s*'
        r'(?:<br\s*/?>\s*)*'
        r'(?:<p[^>]*>\s*)?Kriya\s+Biosys[^<\n]*(?:</p>)?\s*$',
        '', s, flags=re.IGNORECASE | re.DOTALL,
    )
    return s.rstrip()


def append_signature(body, user):
    """Strip any existing signature, then append the user's signature once."""
    cleaned = strip_signature(body or '')
    sig = build_signature_html(user)
    if not cleaned:
        return sig
    # If body is plain text wrap a paragraph so the signature sits below it
    if not re.search(r'<(p|div|br|strong|b)\b', cleaned, re.IGNORECASE):
        cleaned = f'<p>{cleaned}</p>'
    return cleaned + sig
