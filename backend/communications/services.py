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
    for em in admin_mgr_emails:
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
    def send_email(email_account, to, subject, body_html, cc=None, bcc=None, attachments=None):
        """Send email via SMTP. Returns Message-ID on success."""
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

        msg.attach(MIMEText(body_html, 'html'))

        # Attach files
        if attachments:
            for f in attachments:
                part = MIMEBase('application', 'octet-stream')
                part.set_payload(f.read())
                encoders.encode_base64(part)
                part.add_header('Content-Disposition', f'attachment; filename="{f.name}"')
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

    # Folders to scan — covers Gmail, Outlook, and standard IMAP names
    FOLDER_MAP = [
        ('INBOX', 'inbound'),
        ('[Gmail]/Sent Mail', 'outbound'),
        ('[Gmail]/Spam', 'inbound'),
        ('Sent', 'outbound'),
        ('Sent Items', 'outbound'),
        ('Junk', 'inbound'),
        ('Spam', 'inbound'),
    ]

    @staticmethod
    def fetch_emails(email_account, max_count=50):
        """Fetch new emails from Inbox, Sent, and Spam via IMAP."""
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
                # Extract folder name from IMAP LIST response
                # Format: '(\\flags) "delimiter" "folder_name"'
                parts = decoded.split('"')
                if len(parts) >= 3:
                    available_folders.add(parts[-2])
                # Also try the last part after space
                name = decoded.rsplit(' ', 1)[-1].strip('"')
                available_folders.add(name)

            per_folder_limit = max(max_count // 3, 20)

            for folder_name, default_direction in EmailService.FOLDER_MAP:
                # Try to select the folder — skip if it doesn't exist
                status, _ = mail.select(f'"{folder_name}"', readonly=True)
                if status != 'OK':
                    continue

                logger.info(f'Scanning folder: {folder_name} for {email_account.email}')

                # Search for emails since last sync
                if email_account.last_synced:
                    date_str = email_account.last_synced.strftime('%d-%b-%Y')
                    _, message_ids = mail.search(None, f'(SINCE {date_str})')
                else:
                    # First sync: only get last 30 days
                    from datetime import datetime, timedelta
                    since = (datetime.now() - timedelta(days=30)).strftime('%d-%b-%Y')
                    _, message_ids = mail.search(None, f'(SINCE {since})')

                ids = message_ids[0].split()
                for msg_id in ids[-per_folder_limit:]:
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
        """Parse raw email bytes into a dict."""
        msg = email.message_from_bytes(raw_email)

        # Get body
        body = ''
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == 'text/html':
                    body = part.get_payload(decode=True).decode(errors='replace')
                    break
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
