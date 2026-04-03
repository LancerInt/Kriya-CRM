"""
AI Email Reply Service — generates draft replies for incoming client emails.
Uses the configured AI provider (Groq/Gemini/etc.) from agents app.
Falls back to template-based reply if no AI is configured.
"""
import logging
import re

logger = logging.getLogger(__name__)


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

    # Build the prompt
    prompt = f"""You are a professional export trade executive at Kriya Biosys Private Limited.
Write a reply email to the following client email.

Client: {client_name}
Contact: {contact_name}
Original Subject: {original_subject}
Original Email:
{original_body[:1000]}

{f"Previous conversation context:{chr(10)}{thread_context}" if thread_context else ""}

RULES:
- Professional, concise, and friendly tone
- Address the client's query or interest directly
- If they inquire about products, mention we'll share details/quotation
- If they mention pricing, say we'll prepare a competitive quotation
- If they mention samples, offer to arrange sample dispatch
- If they confirm an order, acknowledge and outline next steps
- Sign off as "Kriya Biosys Private Limited"
- Do NOT include email headers (From, To, Date)
- Just write the reply body
- Keep it under 150 words"""

    # Try AI generation
    reply_body = _generate_with_ai(prompt)

    if not reply_body:
        # Fallback to template
        reply_body = _template_reply(client_name, contact_name, original_subject, original_body)

    # Ensure proper greeting and sign-off
    reply_body = _ensure_greeting_signoff(reply_body, contact_name)

    # Build reply subject
    reply_subject = original_subject
    if not reply_subject.lower().startswith('re:'):
        reply_subject = f'Re: {reply_subject}'

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

    # Add sign-off
    clean = f'{clean}\n\nBest regards,\nKriya Biosys Private Limited'
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

    # Reassemble: greeting + refined body + sign-off
    parts = []
    if greeting:
        parts.append(greeting)
    parts.append(result)
    parts.append("Best regards,\nKriya Biosys Private Limited")

    return '\n\n'.join(parts)
