"""
Quote Request Parser — detects quote intent and extracts structured fields from messages.
Uses AI (Groq/Gemini) when available, falls back to rule-based extraction.
"""
import re
import json
import logging

logger = logging.getLogger(__name__)

# ── Rule-based patterns for quote intent detection ──
QUOTE_INTENT_PATTERNS = [
    r'\bquot(e|ation)\b',
    r'\bpric(e|ing|elist)\b',
    r'\bbest\s+price\b',
    r'\bsend\s+(me\s+)?(a\s+)?quot',
    r'\bneed\s+(a\s+)?quot',
    r'\brequest\s+(for\s+)?(a\s+)?quot',
    r'\bcost\s+(of|for)\b',
    r'\brate\s+(for|of)\b',
    r'\bprice\s+(for|of|per)\b',
    r'\bhow\s+much\b',
    r'\bproforma\b',
    r'\bPI\s+for\b',
    r'\binquir(y|e)\b',
    r'\binterested\s+in\b',
    r'\bwant\s+to\s+(buy|order|purchase)\b',
    r'\bMOQ\b',
    r'\b\d+\s*(MT|KG|LTR|ton|kg|litre|liter)\b',
]

# Products commonly traded
PRODUCT_PATTERNS = [
    r'(neem\s*oil)', r'(amino\s*acid)', r'(humic\s*acid)', r'(fulvic\s*acid)',
    r'(seaweed)', r'(bio\s*stimulant)', r'(organic\s*fertilizer)',
    r'(potassium\s*humate)', r'(fish\s*amino)', r'(plant\s*growth)',
]

QUANTITY_PATTERN = r'(\d+[\.,]?\d*)\s*(MT|KG|KGS|LTR|LTRS|GAL|ton|tons|kg|kgs|litre|litres|liter|liters|gallon|gallons|FCL|container|containers)\b'
COUNTRY_PATTERN = r'\b(India|China|Brazil|Mexico|Argentina|USA|UK|Germany|France|Spain|Italy|Turkey|Egypt|South\s*Africa|Nigeria|Kenya|Australia|Japan|Korea|Vietnam|Thailand|Indonesia|Malaysia|Philippines|Colombia|Chile|Peru|Ecuador|Canada)\b'
PORT_PATTERN = r'\bport\s*(of)?\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'
DELIVERY_TERMS_PATTERN = r'\b(FOB|CIF|CFR|EXW|FCA|DAP|DDP)\b'


def detect_quote_intent(text):
    """
    Detect whether a message contains a quote/pricing request.
    Returns: (is_quote_request: bool, confidence: float)
    """
    if not text:
        return False, 0.0

    text_lower = text.lower()
    matches = 0
    total_patterns = len(QUOTE_INTENT_PATTERNS)

    for pattern in QUOTE_INTENT_PATTERNS:
        if re.search(pattern, text_lower, re.IGNORECASE):
            matches += 1

    # Calculate confidence
    if matches == 0:
        return False, 0.0

    confidence = min(0.3 + (matches * 0.15), 1.0)
    is_quote = confidence >= 0.4

    return is_quote, round(confidence, 2)


def extract_quote_fields(text):
    """
    Extract structured fields from a message body.
    Returns dict of extracted fields.
    """
    if not text:
        return {}

    fields = {}

    # Extract product — first check client brand names from DB
    try:
        from products.models import Product
        for product in Product.objects.filter(is_deleted=False, client_brand_names__gt=''):
            for brand_name in product.client_brand_names.split(','):
                brand_name = brand_name.strip()
                if brand_name and re.search(r'\b' + re.escape(brand_name) + r'\b', text, re.IGNORECASE):
                    fields['product'] = product.name
                    break
            if 'product' in fields:
                break
    except Exception:
        pass

    # Then check hardcoded product patterns
    if 'product' not in fields:
        for pattern in PRODUCT_PATTERNS:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                fields['product'] = match.group(0).strip().title()
                break

    # If no known product matched, try to find product-like phrases
    if 'product' not in fields:
        # Look for "interested in <product>" or "<product> quotation"
        product_context = re.search(
            r'(?:interested\s+in|quote\s+for|price\s+(?:of|for)|need|require|looking\s+for)\s+([A-Za-z\s]+?)(?:\s*\d|\s*,|\s*\.|$)',
            text, re.IGNORECASE
        )
        if product_context:
            product = product_context.group(1).strip()
            if len(product) > 2 and len(product) < 100:
                fields['product'] = product.title()

    # Extract quantity + unit
    qty_match = re.search(QUANTITY_PATTERN, text, re.IGNORECASE)
    if qty_match:
        fields['quantity'] = qty_match.group(1).replace(',', '')
        fields['unit'] = qty_match.group(2).upper()
        # Normalize units
        unit_map = {'KGS': 'KG', 'LTRS': 'LTR', 'LITRES': 'LTR', 'LITERS': 'LTR',
                     'LITRE': 'LTR', 'LITER': 'LTR', 'TONS': 'MT', 'TON': 'MT'}
        fields['unit'] = unit_map.get(fields['unit'], fields['unit'])

    # Extract country
    country_match = re.search(COUNTRY_PATTERN, text, re.IGNORECASE)
    if country_match:
        fields['destination_country'] = country_match.group(0).strip()

    # Extract port
    port_match = re.search(PORT_PATTERN, text)
    if port_match:
        fields['destination_port'] = port_match.group(2).strip()

    # Extract delivery terms
    terms_match = re.search(DELIVERY_TERMS_PATTERN, text, re.IGNORECASE)
    if terms_match:
        fields['delivery_terms'] = terms_match.group(0).upper()

    # Extract packaging hints
    packaging_match = re.search(
        r'(?:pack(?:aging|ed)?|container|drum|IBC|bag|bulk)\s*:?\s*([^\n.,]{3,50})',
        text, re.IGNORECASE
    )
    if packaging_match:
        fields['packaging'] = packaging_match.group(0).strip()

    return fields


def extract_with_ai(text, provider_config=None):
    """
    Use AI (Groq/Gemini) to extract quote fields from a message.
    Falls back to rule-based extraction if AI is unavailable.
    """
    if not provider_config:
        # Try to get active AI config
        try:
            from agents.models import AIConfig
            provider_config = AIConfig.objects.filter(is_active=True).first()
        except Exception:
            pass

    if not provider_config:
        return extract_quote_fields(text)

    prompt = f"""Analyze this business message and extract quote request details.
Return a JSON object with these fields (leave empty string if not found):
- product: the product name being inquired about
- quantity: numeric quantity requested
- unit: unit of measurement (MT, KG, LTR, etc.)
- destination_country: destination country
- destination_port: destination port
- delivery_terms: trade terms (FOB, CIF, CFR, etc.)
- payment_terms: payment terms mentioned
- packaging: packaging requirements
- notes: any other relevant details

Message:
{text[:2000]}

Return ONLY valid JSON, no explanation."""

    try:
        from common.encryption import decrypt_value
        api_key = decrypt_value(provider_config.api_key)

        if provider_config.provider == 'groq':
            from groq import Groq
            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model=provider_config.model_name or 'llama-3.3-70b-versatile',
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.1,
                max_tokens=500,
            )
            result = response.choices[0].message.content.strip()

        elif provider_config.provider == 'gemini':
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=provider_config.model_name or 'gemini-2.0-flash',
                contents=prompt,
            )
            result = response.text.strip()
        else:
            return extract_quote_fields(text)

        # Parse JSON from AI response
        # Strip markdown code blocks if present
        if result.startswith('```'):
            result = re.sub(r'^```(?:json)?\s*', '', result)
            result = re.sub(r'\s*```$', '', result)

        parsed = json.loads(result)
        # Normalize keys
        fields = {}
        for key in ['product', 'quantity', 'unit', 'destination_country', 'destination_port',
                     'delivery_terms', 'payment_terms', 'packaging', 'notes']:
            val = parsed.get(key, '')
            if val and str(val).lower() not in ('none', 'null', 'n/a', 'not found', 'not mentioned'):
                fields[key] = str(val)
        return fields

    except Exception as e:
        logger.warning(f'AI extraction failed, falling back to rules: {e}')
        return extract_quote_fields(text)


def detect_intent_with_ai(text, provider_config=None):
    """
    Use AI to determine if a message is a quote request.
    Falls back to rule-based detection if AI is unavailable.
    """
    if not provider_config:
        try:
            from agents.models import AIConfig
            provider_config = AIConfig.objects.filter(is_active=True).first()
        except Exception:
            pass

    if not provider_config:
        return detect_quote_intent(text)

    prompt = f"""Analyze this business message and determine if it's a quote/pricing request.
Return ONLY a JSON object with:
- is_quote_request: true or false
- confidence: number between 0 and 1

Message:
{text[:1500]}

Return ONLY valid JSON."""

    try:
        from common.encryption import decrypt_value
        api_key = decrypt_value(provider_config.api_key)

        if provider_config.provider == 'groq':
            from groq import Groq
            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model=provider_config.model_name or 'llama-3.3-70b-versatile',
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.1,
                max_tokens=100,
            )
            result = response.choices[0].message.content.strip()

        elif provider_config.provider == 'gemini':
            from google import genai
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model=provider_config.model_name or 'gemini-2.0-flash',
                contents=prompt,
            )
            result = response.text.strip()
        else:
            return detect_quote_intent(text)

        if result.startswith('```'):
            result = re.sub(r'^```(?:json)?\s*', '', result)
            result = re.sub(r'\s*```$', '', result)

        parsed = json.loads(result)
        return parsed.get('is_quote_request', False), parsed.get('confidence', 0.5)

    except Exception as e:
        logger.warning(f'AI intent detection failed, falling back to rules: {e}')
        return detect_quote_intent(text)
