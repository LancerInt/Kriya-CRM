import imaplib
import smtplib
import email
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import hashlib
import hmac
import logging

import requests

logger = logging.getLogger(__name__)


def get_client_email_recipients(client, source_quotation=None, source_communication=None):
    """
    Determine the correct 'to' and 'cc' for emailing a client.

    Logic:
    - If source_communication exists, reply to that sender's email
    - If quotation has a linked QuoteRequest with sender_email, use that as 'to'
    - Otherwise use the primary contact's email as 'to'
    - CC = all other contact emails + admin/manager user emails

    Returns: (to_email, to_contact, cc_string)
    """
    from clients.models import Contact
    from accounts.models import User

    contacts = list(Contact.objects.filter(client=client, is_deleted=False).order_by('-is_primary', 'name'))
    if not contacts:
        return None, None, ''

    # Determine the primary recipient
    to_email = None
    to_contact = None

    # 1. Check source communication (e.g. PI request email)
    if source_communication and source_communication.external_email:
        requester_email = source_communication.external_email
        for c in contacts:
            if c.email and c.email.lower() == requester_email.lower():
                to_email = c.email
                to_contact = c
                break
        if not to_email:
            to_email = requester_email
            to_contact = contacts[0]

    # 2. Check if quotation traces back to a quote request with a sender email
    if not to_email and source_quotation:
        try:
            from communications.models import QuoteRequest
            qr = QuoteRequest.objects.filter(
                linked_quotation=source_quotation
            ).select_related('source_communication').first()
            if qr and qr.sender_email:
                for c in contacts:
                    if c.email and c.email.lower() == qr.sender_email.lower():
                        to_email = c.email
                        to_contact = c
                        break
                if not to_email:
                    to_email = qr.sender_email
                    to_contact = contacts[0]
        except Exception:
            pass

    # 3. Fallback: primary contact
    if not to_email:
        for c in contacts:
            if c.email:
                to_contact = c
                to_email = c.email
                break

    if not to_email:
        return None, None, ''

    # Build CC list: other contact emails + admin/manager emails
    cc_parts = []
    for c in contacts:
        if c.email and c.email.lower() != to_email.lower():
            cc_parts.append(c.email)

    # Add admin/manager emails
    admin_mgr_emails = list(
        User.objects.filter(
            is_active=True, role__in=['admin', 'manager']
        ).exclude(email='').values_list('email', flat=True)
    )
    # Temporary exclusion list — addresses that bounce / aren't deliverable.
    # Remove from this set when the mailbox is back online.
    AUTO_CC_EXCLUDE = {'shobana@kriya.com'}
    for em in admin_mgr_emails:
        if em.lower() in AUTO_CC_EXCLUDE:
            continue
        if em.lower() != to_email.lower() and em.lower() not in [e.lower() for e in cc_parts]:
            cc_parts.append(em)

    return to_email, to_contact, ', '.join(cc_parts)


class ContactMatcher:
    @staticmethod
    def match_by_email(email_address):
        """Match email to a Contact, return (client, contact) or (None, None).
        Falls back to domain matching against client website if no direct match."""
        from clients.models import Contact, Client

        # 1. Direct email match on contacts
        contact = Contact.objects.filter(
            email__iexact=email_address, is_deleted=False
        ).select_related('client').first()
        if contact:
            return contact.client, contact

        # 2. Domain-based fallback — match email domain to client website
        domain = email_address.split('@')[-1].lower() if '@' in email_address else ''
        if domain and domain not in ('gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
                                      'live.com', 'aol.com', 'icloud.com', 'mail.com'):
            client = Client.objects.filter(
                is_deleted=False,
                website__icontains=domain,
            ).first()
            if client:
                return client, None

        return None, None

    @staticmethod
    def match_by_phone(phone_number):
        """Match phone to a Contact, return (client, contact) or (None, None)."""
        from clients.models import Contact
        from django.db.models import Q
        normalized = phone_number.replace(' ', '').replace('-', '').replace('+', '')
        contact = Contact.objects.filter(
            Q(phone__icontains=normalized[-10:]) | Q(whatsapp__icontains=normalized[-10:]),
            is_deleted=False
        ).select_related('client').first()
        if contact:
            return contact.client, contact
        return None, None


_RE_PREFIX_RE = None  # lazy compile


def normalize_reply_subject(subject):
    """Return ``Re: <subject>`` with a single ``Re:`` prefix.

    Strips redundant ``Re:`` / ``RE:`` / ``Re[2]:`` / etc. so we never end up
    with ``Re: Re: Re: ...``. Falls back to "Re:" if subject is empty.
    """
    global _RE_PREFIX_RE
    if _RE_PREFIX_RE is None:
        import re as _re
        _RE_PREFIX_RE = _re.compile(r'^\s*(?:re|fwd?|aw|antw)(?:\s*\[\d+\])?\s*:\s*', _re.IGNORECASE)

    s = (subject or '').strip()
    while True:
        new = _RE_PREFIX_RE.sub('', s, count=1).strip()
        if new == s:
            break
        s = new
    return f'Re: {s}' if s else 'Re:'


def _build_references(source):
    """Build a properly chained References header value from a source
    Communication. The chain is: existing References + Message-ID, in order,
    deduplicated, space-separated. Falls back gracefully when fields are
    missing.
    """
    if not source:
        return ''
    parts = []
    seen = set()
    refs_raw = (getattr(source, 'email_references', '') or '').strip()
    if refs_raw:
        for tok in refs_raw.split():
            tok = tok.strip()
            if tok and tok not in seen:
                parts.append(tok)
                seen.add(tok)
    msg_id = (getattr(source, 'email_message_id', '') or '').strip()
    if msg_id and msg_id not in seen:
        parts.append(msg_id)
        seen.add(msg_id)
    return ' '.join(parts)


def get_thread_headers(client, source_communication=None):
    """Resolve the threading headers for an outbound email.

    Returns ``(in_reply_to, references, reply_subject)`` such that Gmail
    keeps every follow-up (dispatch, transit, delivery, FIRC) in the same
    thread as the original customer inquiry.

    Strategy:
      1. Pick a thread *anchor* — the original message that "starts" the
         conversation. Priority: source_communication, then oldest inbound
         from client, then oldest outbound. Used for the canonical subject.
      2. Collect *every* Communication in this thread (linked to the anchor
         via Message-ID / In-Reply-To / References) ordered chronologically.
      3. ``in_reply_to`` = the *most recent* communication's Message-ID
         (the immediate predecessor we are replying after) — this lets
         Gmail extend the chain rather than re-anchor on the original.
      4. ``references`` = anchor.email_references + every Message-ID in the
         thread, chronological, deduped. Gmail uses this list to thread.
      5. ``reply_subject`` = "Re: <anchor.subject>" so subject + headers
         agree (some clients still split threads on subject mismatch).

    Returns ``(None, None, None)`` when no anchor message has a Message-ID.
    """
    from django.db.models import Q
    from .models import Communication

    def _has_id(c):
        return bool(c) and bool((getattr(c, 'email_message_id', '') or '').strip())

    anchor = None
    if _has_id(source_communication):
        anchor = source_communication
    if anchor is None and client is not None:
        try:
            anchor = (Communication.objects
                      .filter(client=client, direction='inbound', comm_type='email',
                              is_deleted=False, email_message_id__gt='')
                      .order_by('created_at').first())
        except Exception:
            anchor = None
    if anchor is None and client is not None:
        try:
            anchor = (Communication.objects
                      .filter(client=client, comm_type='email',
                              is_deleted=False, email_message_id__gt='')
                      .order_by('created_at').first())
        except Exception:
            anchor = None

    if not _has_id(anchor):
        return None, None, None

    anchor_id = anchor.email_message_id.strip()

    thread_comms = []
    if client is not None:
        try:
            thread_comms = list(
                Communication.objects
                .filter(client=client, comm_type='email', is_deleted=False)
                .filter(
                    Q(email_message_id=anchor_id)
                    | Q(email_in_reply_to=anchor_id)
                    | Q(email_references__contains=anchor_id)
                )
                .exclude(email_message_id='')
                .order_by('created_at')
            )
        except Exception:
            thread_comms = []

    seen = set()
    parts = []
    anchor_refs = (getattr(anchor, 'email_references', '') or '').strip()
    if anchor_refs:
        for tok in anchor_refs.split():
            tok = tok.strip()
            if tok and tok not in seen:
                parts.append(tok)
                seen.add(tok)
    if anchor_id not in seen:
        parts.append(anchor_id)
        seen.add(anchor_id)
    for tc in thread_comms:
        mid = (tc.email_message_id or '').strip()
        if mid and mid not in seen:
            parts.append(mid)
            seen.add(mid)

    in_reply_to = parts[-1] if parts else anchor_id

    return (
        in_reply_to,
        ' '.join(parts),
        normalize_reply_subject(getattr(anchor, 'subject', '') or ''),
    )


class EmailService:
    @staticmethod
    def _decode_header(raw):
        """Decode MIME encoded-word headers like =?UTF-8?Q?...?= into plain text."""
        if not raw or '=?' not in raw:
            return raw
        from email.header import decode_header
        parts = decode_header(raw)
        decoded = ''
        for part, charset in parts:
            if isinstance(part, bytes):
                decoded += part.decode(charset or 'utf-8', errors='replace')
            else:
                decoded += part
        return decoded

    @staticmethod
    def send_email(email_account, to, subject, body_html, cc=None, bcc=None, attachments=None, in_reply_to=None, references=None):
        """Send email via SMTP. Returns Message-ID on success.

        MIME structure:
            multipart/mixed                 (only when file attachments exist)
              ├── text/html                 (the rendered email)
              └── application/octet-stream  (PDF attachments, etc.)

        The signature is text-only HTML — no inline images. Embedding any
        image as a related cid: part causes Gmail to show an attachment chip
        in the inbox preview (even with no filename + Content-Disposition:
        inline). If you want a logo in the signature, host it at a public
        HTTPS URL and set settings.SIGNATURE_LOGO_URL.
        """
        from common.encryption import decrypt_value
        from email.mime.base import MIMEBase
        from email import encoders
        password = decrypt_value(email_account.password)

        msg = MIMEMultipart('mixed')
        msg['From'] = f'{email_account.display_name or email_account.email} <{email_account.email}>'
        msg['To'] = to
        msg['Subject'] = subject
        if cc:
            msg['Cc'] = cc
        if in_reply_to:
            msg['In-Reply-To'] = in_reply_to
        if references:
            msg['References'] = references
        # Always assign a Message-ID up front so callers can persist it on the
        # outbound Communication and continue threading downstream.
        from email.utils import make_msgid
        domain = email_account.email.split('@', 1)[-1] if email_account.email else None
        msg['Message-ID'] = make_msgid(domain=domain)

        # HTML body — no related multipart wrapper, no inline images
        msg.attach(MIMEText(body_html, 'html', _charset='utf-8'))

        # Attach files. Set the filename in BOTH Content-Type (name=)
        # and Content-Disposition (filename=) so every mail client picks
        # up the user-renamed name. add_header's keyword form lets
        # Python's email module RFC-2231-encode non-ASCII characters.
        if attachments:
            for f in attachments:
                fname = getattr(f, 'name', '') or 'attachment'
                # Strip any directory path component a caller may have
                # passed accidentally — keep just the basename.
                import os as _os
                fname = _os.path.basename(fname)
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(f.read())
                encoders.encode_base64(part)
                part.set_param('name', fname)
                part.add_header('Content-Disposition', 'attachment', filename=fname)
                msg.attach(part)

        try:
            if email_account.smtp_port == 465:
                server = smtplib.SMTP_SSL(email_account.smtp_host, email_account.smtp_port)
            else:
                server = smtplib.SMTP(email_account.smtp_host, email_account.smtp_port)
                server.starttls()
            server.login(email_account.username, password)
            recipients = [to]
            if cc:
                recipients.extend(cc.split(','))
            if bcc:
                recipients.extend(bcc.split(','))
            server.sendmail(email_account.email, recipients, msg.as_string())
            message_id = msg['Message-ID'] or ''
            server.quit()
            return message_id
        except Exception as e:
            logger.error(f'SMTP send failed: {e}')
            raise

    # Folders to scan — covers Gmail, Outlook, and standard IMAP names.
    # NOTE: For Gmail, [Gmail]/All Mail is the archive folder where every
    # message lives once it leaves the Inbox; without it, historical pulls
    # only see currently-active threads and miss archived history. We scan
    # All Mail LAST and rely on Message-ID dedup to skip already-imported
    # mails that also appear in Inbox/Sent.
    FOLDER_MAP = [
        ('INBOX', 'inbound'),
        ('[Gmail]/Sent Mail', 'outbound'),
        ('[Gmail]/Spam', 'inbound'),
        ('Sent', 'outbound'),
        ('Sent Items', 'outbound'),
        ('Junk', 'inbound'),
        ('Spam', 'inbound'),
        ('[Gmail]/All Mail', 'inbound'),  # Gmail archive — direction inferred from sender
        ('Archive', 'inbound'),            # Outlook / standard IMAP archive
        ('All Mail', 'inbound'),           # provider variations
    ]

    @staticmethod
    def fetch_emails(email_account, max_count=50, days_back=None):
        """Fetch emails from Inbox, Sent, and Spam via IMAP.

        Args:
            email_account: EmailAccount instance
            max_count: max emails per folder
            days_back: if set, fetch emails from this many days ago
                       (overrides last_synced for historical pulls)
        """
        from common.encryption import decrypt_value
        password = decrypt_value(email_account.password)

        results = []
        try:
            if email_account.use_ssl:
                mail = imaplib.IMAP4_SSL(email_account.imap_host, email_account.imap_port)
            else:
                mail = imaplib.IMAP4(email_account.imap_host, email_account.imap_port)

            mail.login(email_account.username, password)

            # Get list of available folders
            _, folder_list = mail.list()
            available_folders = set()
            for f in folder_list:
                decoded = f.decode() if isinstance(f, bytes) else str(f)
                parts = decoded.split('"')
                if len(parts) >= 3:
                    available_folders.add(parts[-2])
                name = decoded.rsplit(' ', 1)[-1].strip('"')
                available_folders.add(name)

            # Per-folder cap. The default (delta) sync only needs a small
            # window since it runs every 5 min. Historical pulls must NOT
            # be capped — IMAP returns IDs in ascending order, so a small
            # cap silently truncates the OLDEST emails (worst-case for a
            # backfill). Bump to 100k which covers 10+ years of even
            # heavy inboxes; the SINCE filter is the actual gate.
            per_folder_limit = max(max_count // 3, 20)
            historical = bool(days_back and days_back > 30)
            if historical:
                per_folder_limit = 100000

            for folder_name, default_direction in EmailService.FOLDER_MAP:
                status, _ = mail.select(f'"{folder_name}"', readonly=True)
                if status != 'OK':
                    continue

                logger.info(f'Scanning folder: {folder_name} for {email_account.email}')

                # Search for emails — days_back overrides last_synced
                from datetime import datetime, timedelta
                if days_back:
                    since = (datetime.now() - timedelta(days=days_back)).strftime('%d-%b-%Y')
                    _, message_ids = mail.search(None, f'(SINCE {since})')
                elif email_account.last_synced:
                    date_str = email_account.last_synced.strftime('%d-%b-%Y')
                    _, message_ids = mail.search(None, f'(SINCE {date_str})')
                else:
                    since = (datetime.now() - timedelta(days=30)).strftime('%d-%b-%Y')
                    _, message_ids = mail.search(None, f'(SINCE {since})')

                ids = message_ids[0].split()
                if historical:
                    logger.info(f'  → {folder_name}: IMAP SINCE returned {len(ids)} IDs (no cap, fetching all)')
                pick = ids if historical else ids[-per_folder_limit:]
                for msg_id in pick:
                    _, msg_data = mail.fetch(msg_id, '(RFC822)')
                    if msg_data[0] is None:
                        continue
                    raw_email = msg_data[0][1]
                    parsed = EmailService._parse_email(raw_email)
                    if parsed:
                        parsed['folder'] = folder_name
                        parsed['default_direction'] = default_direction
                        results.append(parsed)

            mail.logout()
        except Exception as e:
            logger.error(f'IMAP fetch failed for {email_account.email}: {e}')

        return results

    @staticmethod
    def _parse_email(raw_email):
        """Parse raw email bytes into a dict including file attachments."""
        msg = email.message_from_bytes(raw_email)

        # Get body and collect attachments (anything with a filename or
        # explicitly marked Content-Disposition: attachment).
        body = ''
        attachments = []
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                disposition = (part.get('Content-Disposition') or '').lower()
                filename = part.get_filename()
                if filename:
                    filename = EmailService._decode_header(filename)
                # Treat as attachment when filename present OR explicit
                # disposition. Skip multipart containers.
                if part.get_content_maintype() == 'multipart':
                    continue
                if filename or 'attachment' in disposition:
                    try:
                        payload = part.get_payload(decode=True)
                    except Exception:
                        payload = None
                    if payload:
                        attachments.append({
                            'filename': filename or 'attachment.bin',
                            'content': payload,
                            'mime_type': content_type or 'application/octet-stream',
                            'size': len(payload),
                        })
                    continue
                # Body parts (no filename / inline)
                if content_type == 'text/html' and not body:
                    body = part.get_payload(decode=True).decode(errors='replace')
                elif content_type == 'text/plain' and not body:
                    body = part.get_payload(decode=True).decode(errors='replace')
        else:
            body = msg.get_payload(decode=True).decode(errors='replace')

        from email.utils import parseaddr, parsedate_to_datetime
        _, from_email = parseaddr(msg.get('From', ''))
        _, to_email = parseaddr(msg.get('To', ''))

        try:
            date = parsedate_to_datetime(msg.get('Date', ''))
        except Exception:
            from django.utils import timezone
            date = timezone.now()

        # Parse CC addresses
        cc_raw = msg.get('Cc', '') or msg.get('CC', '') or ''
        from email.utils import getaddresses
        cc_list = [addr for _, addr in getaddresses([cc_raw]) if addr]
        cc_string = ', '.join(cc_list)

        return {
            'from_email': from_email,
            'to_email': to_email,
            'cc': cc_string,
            'subject': EmailService._decode_header(msg.get('Subject', '(No Subject)')),
            'body': body,
            'date': date,
            'message_id': msg.get('Message-ID', ''),
            'in_reply_to': msg.get('In-Reply-To', ''),
            'references': (msg.get('References', '') or '').strip(),
            'attachments': attachments,
        }


class WhatsAppService:
    API_VERSION = 'v18.0'
    BASE_URL = f'https://graph.facebook.com/{API_VERSION}'

    @staticmethod
    def send_message(config, to_phone, message_text):
        """Send WhatsApp message via Cloud API. Returns message ID."""
        from common.encryption import decrypt_value
        token = decrypt_value(config.access_token)

        url = f'{WhatsAppService.BASE_URL}/{config.phone_number_id}/messages'
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }
        payload = {
            'messaging_product': 'whatsapp',
            'to': to_phone,
            'type': 'text',
            'text': {'body': message_text},
        }

        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        return data.get('messages', [{}])[0].get('id', '')

    @staticmethod
    def verify_webhook_signature(payload, signature, secret):
        """Verify Meta webhook signature."""
        expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(f'sha256={expected}', signature)
