"""
AI Email Reply Service — generates draft replies for incoming client emails.
Uses the configured AI provider (Groq/Gemini/etc.) from agents app.
Falls back to template-based reply if no AI is configured.
"""
import html
import logging
import re

logger = logging.getLogger(__name__)


def _markdown_to_html(text):
    """Convert plain text (with **bold** markers and newlines) into Quill-compatible HTML.

    The AI is instructed to use **double-asterisks** for bold; the rich-text editor
    on the frontend (Quill) does not understand markdown, so we convert it here so
    the user sees properly bolded HTML instead of literal asterisks.
    """
    if not text:
        return ''
    # If the body already looks like HTML (has tags), leave it alone.
    if re.search(r'<(p|br|strong|b|div|span)\b', text, re.IGNORECASE):
        return text
    # Escape HTML special chars so we don't accidentally render unintended markup.
    escaped = html.escape(text)
    # Convert **bold** → <strong>bold</strong>
    escaped = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', escaped, flags=re.DOTALL)
    # Also handle single *italic* → <em>italic</em> (but avoid touching list bullets)
    escaped = re.sub(r'(?<!\*)\*([^*\n]+?)\*(?!\*)', r'<em>\1</em>', escaped)
    # Build paragraphs: blank line = paragraph break; single newline = <br>
    paragraphs = re.split(r'\n\s*\n', escaped)
    parts = []
    for p in paragraphs:
        p = p.strip('\n')
        if not p:
            continue
        parts.append('<p>' + p.replace('\n', '<br>') + '</p>')
    return ''.join(parts) if parts else f'<p>{escaped}</p>'


def generate_email_reply(communication):
    """
    Generate an AI-powered draft reply for an incoming email.
    Returns dict: { subject, body }
    """
    client_name = communication.client.company_name if communication.client else 'Valued Customer'
    contact_name = _get_contact_name(communication)
    original_subject = communication.subject or '(No Subject)'
    original_body = _clean_html(communication.body or '')
    thread_context = _get_thread_context(communication)

    # Detect intent — sample-only requests must NOT include any pricing.
    # Quote/PI requests still need price context for the AI to draft properly.
    email_lower = f"{original_subject} {original_body}".lower()
    is_sample_request = bool(re.search(r'\b(sample|samples|trial|swatch|free sample)\b', email_lower))
    is_quote_or_pi = bool(re.search(
        r'\b(quotation|quote|pricing|price list|rate card|rates|proforma invoice|proforma|performa|pi)\b',
        email_lower,
    ))
    sample_only = is_sample_request and not is_quote_or_pi

    # Sample dispatch lead time — configurable, defaults to 10-15 days
    from django.conf import settings as _settings
    sample_lead_time = getattr(_settings, 'SAMPLE_DISPATCH_DAYS', '10-15 days')

    # Fetch product/price context for the AI. We only include price info when
    # the email is NOT a pure sample request — mentioning the price in a sample
    # acknowledgment is unprofessional.
    product_context = ""
    if communication.client:
        try:
            from clients.models import ClientPriceList
            from products.models import Product
            prices = ClientPriceList.objects.filter(client=communication.client, is_deleted=False)[:10]
            if prices.exists() and not sample_only:
                price_lines = [f"- {p.product_name}: {p.currency} {p.unit_price}/{p.unit}" + (f" (client calls it: {p.client_product_name})" if p.client_product_name else "") for p in prices]
                product_context = f"\nClient's Price List:\n" + "\n".join(price_lines)
            # Match product from email text
            for product in Product.objects.filter(is_deleted=False):
                if product.name.lower() in email_lower or (product.client_brand_names and any(b.strip().lower() in email_lower for b in product.client_brand_names.split(",") if b.strip())):
                    if sample_only:
                        product_context += f"\nMatched Product: {product.name} ({product.concentration})"
                    else:
                        client_price = prices.filter(product_name__iexact=product.name).first()
                        price_val = f"{client_price.currency} {client_price.unit_price}/{client_price.unit}" if client_price else f"USD {product.base_price}/{product.unit}"
                        product_context += f"\nMatched Product: {product.name} ({product.concentration}) - Price: {price_val}"
                    break
        except Exception:
            pass

    # Build the prompt — different rules for sample-only vs quote/PI/general
    if sample_only:
        prompt = f"""You are a professional export trade executive at Kriya Biosys Private Limited.
The client has asked for a SAMPLE. Write a polite, helpful reply that confirms you'll arrange the sample.

Client: {client_name}
Contact: {contact_name}
Original Subject: {original_subject}
Original Email:
{original_body[:1000]}
{product_context}
{f"Previous conversation context:{chr(10)}{thread_context}" if thread_context else ""}

Sample dispatch lead time: {sample_lead_time}

RULES:
- Professional, warm, concise tone
- Acknowledge the sample request clearly
- Mention the SPECIFIC product name in **bold** (e.g. **Neem Oil 0.3%**)
- State that the sample will be dispatched within **{sample_lead_time}** (bold this phrase)
- Mention that the sample will be accompanied by **Certificate of Analysis (COA)**, **Technical Specifications**, and **Safety Data Sheet** (where available)
- Offer to share dispatch tracking once the sample is shipped
- Close with a forward-looking line about supporting their evaluation
- ABSOLUTELY DO NOT mention any price, USD/MT amount, currency figure, quotation, or proforma invoice — this is purely a sample acknowledgment, prices belong in a separate quotation
- Do NOT add any sign-off, "Best regards", "Thanks and Regards", or company name at the end — the signature is added separately by the system
- Do NOT include email headers (From, To, Date)
- Just write the reply body
- Keep it under 130 words"""
    else:
        prompt = f"""You are a professional export trade executive at Kriya Biosys Private Limited.
Write a reply email to the following client email.

Client: {client_name}
Contact: {contact_name}
Original Subject: {original_subject}
Original Email:
{original_body[:1000]}
{product_context}
{f"Previous conversation context:{chr(10)}{thread_context}" if thread_context else ""}

RULES:
- Professional, concise, and friendly tone
- Address the client's query or interest directly
- **Bold the key answers** to client's questions using **double asterisks**
- For example: product name, price, quantity, delivery terms, payment terms — bold these
- If they inquire about products, mention the SPECIFIC product name and its price in **bold**
- If product price is available, write it as **USD 1,800/MT** (bold with currency)
- If they ask about delivery, bold the delivery terms like **FOB Chennai**
- If they confirm an order, acknowledge and outline next steps
- Do NOT add any sign-off, "Best regards", "Thanks and Regards", or company name at the end — the signature is added separately by the system
- Do NOT include email headers (From, To, Date)
- Just write the reply body
- Keep it under 150 words"""

    # Try AI generation
    reply_body = _generate_with_ai(prompt)

    if not reply_body:
        # Fallback to template
        reply_body = _template_reply(client_name, contact_name, original_subject, original_body)

    # Ensure greeting at the top. The sign-off / signature block is appended
    # later by the send pipeline using the sender's user signature, so we
    # explicitly strip any sign-off the AI may have added.
    reply_body = _ensure_greeting_signoff(reply_body, contact_name)
    from .signature import strip_signature
    reply_body = strip_signature(reply_body)

    # Convert AI markdown (**bold**, newlines) into HTML so Quill renders it correctly
    reply_body = _markdown_to_html(reply_body)

    # Build reply subject
    reply_subject = original_subject
    if not reply_subject.lower().startswith('re:'):
        reply_subject = f'Re: {reply_subject}'

    return {
        'subject': reply_subject,
        'body': reply_body,
    }


def generate_followup_email(communication):
    """Generate an AI-powered FOLLOW-UP email for a previously sent message
    that the client hasn't responded to.

    The tone is different from generate_email_reply():
    - We're nudging the client, not answering them
    - Reference the previous email politely without restating its full content
    - Acknowledge their time, ask if they had a chance to review
    - Offer to clarify anything / answer questions
    - End with a soft call-to-action ("looking forward to hearing from you")

    Returns dict: { subject, body }
    """
    client_name = communication.client.company_name if communication.client else 'Valued Customer'
    contact_name = _get_contact_name(communication)
    original_subject = communication.subject or '(No Subject)'
    original_body = _clean_html(communication.body or '')
    thread_context = _get_thread_context(communication)

    # Days since the message we're following up on
    from django.utils import timezone
    days_since = ''
    try:
        delta = timezone.now() - communication.created_at
        d = delta.days
        if d <= 0:
            days_since = 'earlier today'
        elif d == 1:
            days_since = 'yesterday'
        else:
            days_since = f'{d} days ago'
    except Exception:
        pass

    # Pull what we sent in the original message so the AI can reference it
    summary = original_body[:600]

    prompt = f"""You are a professional export trade executive at Kriya Biosys Private Limited.
You are writing a polite FOLLOW-UP email to a client who hasn't responded to your previous message yet.

Client: {client_name}
Contact: {contact_name}
Original subject we sent: {original_subject}
Original message we sent ({days_since}):
{summary}
{f"Thread context:{chr(10)}{thread_context}" if thread_context else ""}

RULES:
- Polite, friendly nudge — NOT pushy
- Open with "I hope this message finds you well." or similar warm opener
- Acknowledge that you sent the previous email {days_since} (only if days_since is set)
- Briefly reference what the previous email was about (1 short sentence) — do not re-list all details
- Ask if they had a chance to review and if they have any questions or need clarification
- Offer to provide any additional information they need (e.g. samples, quotation, technical sheet)
- End with a soft call-to-action like "Looking forward to hearing from you"
- **Bold** any key terms (product name, price, quote number) with double asterisks if mentioning them
- Do NOT add any sign-off, "Best regards", "Thanks and Regards", or company name at the end — the signature is added separately by the system
- Do NOT include email headers (From, To, Date)
- Just write the reply body
- Keep it under 100 words — follow-ups should be SHORT"""

    reply_body = _generate_with_ai(prompt)

    if not reply_body:
        # Template fallback when no AI is configured
        days_phrase = f' I sent you a message {days_since}' if days_since else ''
        reply_body = (
            f"Dear {contact_name},\n\n"
            f"I hope this message finds you well.{days_phrase} regarding "
            f"{original_subject.lower().replace('re: ', '').replace('quotation for', 'a quotation for')}, "
            f"and I wanted to follow up to see if you had a chance to review it.\n\n"
            f"Please let me know if you have any questions or if there is any additional information I can provide.\n\n"
            f"Looking forward to hearing from you."
        )

    reply_body = _ensure_greeting_signoff(reply_body, contact_name)
    from .signature import strip_signature
    reply_body = strip_signature(reply_body)
    reply_body = _markdown_to_html(reply_body)

    # Subject: prefix "Follow up: " unless already a Re:
    reply_subject = original_subject
    if reply_subject.lower().startswith('re:'):
        reply_subject = reply_subject  # keep the existing Re: chain
    elif reply_subject.lower().startswith('follow up'):
        reply_subject = reply_subject
    else:
        reply_subject = f'Follow up: {reply_subject}'

    return {
        'subject': reply_subject,
        'body': reply_body,
    }


def _generate_with_ai(prompt):
    """Try to generate reply using configured AI provider."""
    try:
        from agents.models import AIConfig
        from common.encryption import decrypt_value

        config = AIConfig.objects.filter(is_active=True).first()
        if not config:
            return None

        api_key = decrypt_value(config.api_key)

        if config.provider == 'groq':
            return _groq_generate(api_key, config.model_name, prompt)
        elif config.provider == 'gemini':
            return _gemini_generate(api_key, config.model_name, prompt)
        else:
            return None

    except Exception as e:
        logger.error(f'AI email generation failed: {e}')
        return None


def _groq_generate(api_key, model, prompt):
    from groq import Groq
    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model=model or 'llama-3.3-70b-versatile',
        messages=[
            {'role': 'system', 'content': 'You are a trade executive. Write natural, human-sounding professional emails. Keep it short and friendly — 1-2 paragraphs max.'},
            {'role': 'user', 'content': prompt},
        ],
        temperature=0.7,
        max_tokens=800,
    )
    return response.choices[0].message.content.strip()


def _gemini_generate(api_key, model, prompt):
    from google import genai
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model or 'gemini-2.0-flash',
        contents=prompt,
    )
    return response.text.strip()


def _template_reply(client_name, contact_name, subject, body):
    """Fallback template-based reply when AI is not available."""
    body_lower = body.lower()

    if any(w in body_lower for w in ['price', 'quotation', 'quote', 'pricing', 'rate']):
        return f"""Dear {contact_name},

Thank you for your interest in our products.

We will prepare a competitive quotation based on your requirements and share it with you shortly.

Could you please confirm the required quantity and preferred delivery terms (FOB/CIF/CFR)?

Best regards,
Kriya Biosys Private Limited"""

    elif any(w in body_lower for w in ['sample', 'trial', 'test']):
        return f"""Dear {contact_name},

Thank you for reaching out.

We would be happy to arrange product samples for your evaluation. Please share:
- Products of interest
- Required quantity for testing
- Shipping address

We will dispatch the samples at the earliest.

Best regards,
Kriya Biosys Private Limited"""

    elif any(w in body_lower for w in ['order', 'confirm', 'proceed', 'purchase']):
        return f"""Dear {contact_name},

Thank you for confirming your interest.

We will prepare the Proforma Invoice with the agreed terms and share it for your review and confirmation.

Please let us know if you need any modifications.

Best regards,
Kriya Biosys Private Limited"""

    else:
        return f"""Dear {contact_name},

Thank you for your email.

We have noted your inquiry and our team will review it promptly. We will get back to you with the necessary details shortly.

Should you have any immediate questions, please don't hesitate to reach out.

Best regards,
Kriya Biosys Private Limited"""


def _ensure_greeting_signoff(body, contact_name):
    """Ensure email body has Dear <name>, at top and Best regards at bottom."""
    # Check if greeting exists
    has_greeting = bool(re.match(r'^Dear\s+', body, re.IGNORECASE))

    # Strip any existing sign-off variations
    clean = re.sub(
        r'\n*(Best regards|Kind regards|Warm regards|Regards|Sincerely|Thanks|Thank you),?\s*\n.*$',
        '', body, flags=re.IGNORECASE | re.DOTALL
    ).rstrip()

    # Also strip standalone company name at the end (without "Best regards" before it)
    clean = re.sub(r'\n+Kriya\s+Biosys[^\n]*$', '', clean, flags=re.IGNORECASE).rstrip()

    # If no greeting, strip any misplaced one from middle/end and add at top
    if not has_greeting:
        clean = re.sub(r'\n*Dear\s+[^,\n]+,?\s*$', '', clean, flags=re.IGNORECASE).rstrip()
        if contact_name:
            clean = f'Dear {contact_name},\n\n{clean}'

    # NOTE: We deliberately do NOT add a sign-off here. The signature block
    # (with Thanks and Regards + executive name + logo + contact info) is
    # appended at send-time by communications/signature.append_signature() so
    # each user gets their own per-account signature.
    return clean


def _get_contact_name(communication):
    """Get the contact's current name from the client's contacts (handles renames)."""
    # Look up current contact name by email (in case name was changed)
    if communication.client and communication.external_email:
        from clients.models import Contact
        contact = Contact.objects.filter(
            client=communication.client, email__iexact=communication.external_email, is_deleted=False
        ).first()
        if contact and contact.name:
            return contact.name
    if communication.contact and communication.contact.name:
        return communication.contact.name
    if communication.external_email:
        return communication.external_email.split('@')[0].title()
    return 'Sir/Madam'


def _get_thread_context(communication):
    """Get previous email context for this client."""
    if not communication.client:
        return ''

    from communications.models import Communication
    previous = Communication.objects.filter(
        client=communication.client,
        comm_type='email',
    ).exclude(id=communication.id).order_by('-created_at')[:3]

    if not previous:
        return ''

    context = []
    for msg in previous:
        direction = 'Client' if msg.direction == 'inbound' else 'Us'
        body = _clean_html(msg.body or '')[:200]
        context.append(f"[{direction}] {msg.subject}: {body}")

    return '\n'.join(context)


def _clean_html(html):
    """Strip HTML tags from email body."""
    return re.sub(r'<[^>]+>', ' ', html).strip()


REFINE_PROMPTS = {
    'polish': 'Improve the grammar, clarity, and flow of this email while keeping the same meaning and tone. Fix any typos or awkward phrasing. Keep the same length.',
    'formalize': 'Rewrite this email in a more formal, professional business tone. Use proper business language suitable for international trade correspondence. Keep the same content and meaning.',
    'elaborate': 'Expand on the points in this email with more detail and context. Add relevant professional details while keeping it natural and concise. Do not exceed 2x the original length.',
    'shorten': 'Condense this email to be shorter and more concise while keeping all key information. Remove unnecessary words and filler. Aim for 50-70% of the original length.',
}


def refine_email_body(body, action, contact_name=''):
    """
    Refine email body text using AI.
    action: polish | formalize | elaborate | shorten
    Returns the refined text or original if AI fails.
    """
    instruction = REFINE_PROMPTS.get(action)
    if not instruction:
        return body

    # If body is HTML (from prior generation), convert to plain text first so the
    # greeting/sign-off regexes below still work.
    if re.search(r'<(p|br|strong|b|div)\b', body or '', re.IGNORECASE):
        body = re.sub(r'<\s*br\s*/?>', '\n', body, flags=re.IGNORECASE)
        body = re.sub(r'</\s*p\s*>', '\n\n', body, flags=re.IGNORECASE)
        body = re.sub(r'<strong>(.*?)</strong>', r'**\1**', body, flags=re.IGNORECASE | re.DOTALL)
        body = re.sub(r'<b>(.*?)</b>', r'**\1**', body, flags=re.IGNORECASE | re.DOTALL)
        body = re.sub(r'<[^>]+>', '', body)
        body = html.unescape(body).strip()

    # Extract greeting (Dear ...,) from the original body if present
    greeting = ''
    clean_body = body
    greeting_match = re.match(r'^(Dear\s+[^,\n]+,)\s*\n?', body, re.IGNORECASE)
    if greeting_match:
        greeting = greeting_match.group(1)
        clean_body = body[greeting_match.end():].strip()
    elif contact_name:
        greeting = f'Dear {contact_name},'

    # Strip any existing sign-off from the body before sending to AI
    clean_body = re.sub(
        r'\n*(Best regards|Kind regards|Warm regards|Regards|Sincerely|Thanks|Thank you),?\s*\n.*$',
        '', clean_body, flags=re.IGNORECASE | re.DOTALL
    ).rstrip()

    prompt = f"""{instruction}

EMAIL BODY (no greeting, no sign-off):
{clean_body}

RULES:
- Return ONLY the refined body text
- Do NOT include any greeting like "Dear ..."
- Do NOT include any sign-off like "Best regards" or company name
- Do NOT add subject line, headers, or explanations
- Just return the refined body paragraphs"""

    result = _generate_with_ai(prompt)
    if not result:
        return body

    # Clean AI output: remove any greeting/sign-off the AI may have added
    result = re.sub(r'^(Dear\s+[^,\n]+,)\s*\n?', '', result, flags=re.IGNORECASE).strip()
    result = re.sub(
        r'\n*(Best regards|Kind regards|Warm regards|Regards|Sincerely|Thanks|Thank you),?\s*\n.*$',
        '', result, flags=re.IGNORECASE | re.DOTALL
    ).rstrip()

    # Reassemble: greeting + refined body. The sign-off / signature is added
    # at send-time per user, so we don't append it here.
    parts = []
    if greeting:
        parts.append(greeting)
    parts.append(result)

    return _markdown_to_html('\n\n'.join(parts))
