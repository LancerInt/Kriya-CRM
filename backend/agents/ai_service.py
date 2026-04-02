"""AI Service — connects to LLM providers and executes CRM tool calls."""
import json
import re
import logging
from .tools import _get_tools_for_user

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
SYSTEM_PROMPT_BASE = """You are Kriya, the smart assistant built into Kriya CRM. Speak like a knowledgeable colleague — warm, direct, and professional.

RESPONSE RULES:
- Lead with the answer immediately. Don't restate the question.
- Use **bold** for key numbers, names, and statuses.
- Use bullet points for 3+ items. Use ## headings only for multi-section responses.
- End with 1–2 specific next steps under ### Next Steps when helpful.
- Be concise. No filler like "Certainly!" or "Great question!".
- If data is empty, say so plainly and suggest an action.

TOOL RULES:
- Most data is already pre-loaded below — use it directly, no tool call needed.
- Only call a tool for something NOT in the pre-loaded data (e.g. a specific client by name, a product lookup).
- NEVER ask the user for IDs. Use names as-is.
- NEVER invent numbers."""


def _build_system_prompt(user, prefetched: str) -> str:
    if user.role == 'executive':
        role_ctx = (
            f"\nCONTEXT: Speaking with **{user.full_name}** (Executive). "
            "All data is filtered to their portfolio only. Never reference other executives."
        )
    else:
        role_ctx = (
            f"\nCONTEXT: Speaking with **{user.full_name}** ({user.get_role_display()}). "
            "Full access to all CRM data. Use get_executive_overview for team performance."
        )
    data_ctx = f"\n\nPRE-LOADED DATA:\n{prefetched}" if prefetched else ""
    return SYSTEM_PROMPT_BASE + role_ctx + data_ctx


# ---------------------------------------------------------------------------
# Pre-fetcher — compact summaries, not raw JSON dumps
# ---------------------------------------------------------------------------
def _prefetch_context(user, message: str) -> str:
    from .tools import (
        get_dashboard_stats, get_tasks, get_pipeline_summary,
        get_overdue_invoices, get_recent_communications,
        get_orders, get_shipments, get_executive_overview,
    )
    msg = message.lower()
    parts = {}

    try:
        parts['stats'] = get_dashboard_stats(user)
    except Exception:
        pass

    if any(w in msg for w in ['task', 'overdue', 'todo', 'pending', 'due', 'assign']):
        try:
            parts['tasks'] = get_tasks(user, limit='15')
        except Exception:
            pass

    if any(w in msg for w in ['pipeline', 'lead', 'inquiry', 'stage', 'deal', 'prospect']):
        try:
            parts['pipeline'] = get_pipeline_summary(user)
        except Exception:
            pass

    if any(w in msg for w in ['order', 'sale', 'revenue']):
        try:
            parts['orders'] = get_orders(user, limit='10')
        except Exception:
            pass

    if any(w in msg for w in ['invoice', 'payment', 'bill', 'finance', 'outstanding']):
        try:
            parts['invoices'] = get_overdue_invoices(user)
        except Exception:
            pass

    if any(w in msg for w in ['email', 'communication', 'message', 'whatsapp', 'call', 'conversation']):
        try:
            parts['communications'] = get_recent_communications(user, limit='8')
        except Exception:
            pass

    if any(w in msg for w in ['shipment', 'shipping', 'transit', 'delivery', 'dispatch', 'container']):
        try:
            parts['shipments'] = get_shipments(user, limit='8')
        except Exception:
            pass

    if user.role in ('admin', 'manager') and any(w in msg for w in ['executive', 'team', 'overview', 'workload', 'performance', 'staff']):
        try:
            parts['executives'] = get_executive_overview(user)
        except Exception:
            pass

    if not parts:
        return ""
    return json.dumps(parts, default=str, separators=(',', ':'))


# ---------------------------------------------------------------------------
# Compact tool description
# ---------------------------------------------------------------------------
def _build_tool_desc(tool_registry: dict) -> str:
    lines = [
        "\n\nTOOLS (only call when data is NOT in pre-loaded context above):",
        'Format: ```tool\n{"tool":"name","args":{"key":"value"}}\n```',
    ]
    for name, info in tool_registry.items():
        params = ', '.join(info['parameters'].keys())
        lines.append(f"- {name}({params}): {info['description']}")
    lines.append("Use names not IDs. No tool blocks in final answer.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Streaming entry point
# ---------------------------------------------------------------------------
def stream_chat_with_agent(messages, user, config):
    """
    Generator that yields dicts:
      {'type': 'chunk', 'content': str}   — text delta
      {'type': 'tool_calls', 'data': list} — tool metadata
      {'type': 'error', 'content': str}   — error message
    """
    from common.encryption import decrypt_value
    api_key = decrypt_value(config.api_key)
    last_message = messages[-1]['content'] if messages else ''
    prefetched = _prefetch_context(user, last_message)

    provider = config.provider
    if provider == 'groq':
        yield from _stream_groq(messages, user, api_key, config.model_name, prefetched)
    elif provider == 'gemini':
        yield from _stream_gemini(messages, user, api_key, config.model_name, prefetched)
    else:
        yield {'type': 'chunk', 'content': 'This AI provider does not support streaming yet.'}
        yield {'type': 'tool_calls', 'data': []}


# ---------------------------------------------------------------------------
# Non-streaming fallback (kept for quick-chat)
# ---------------------------------------------------------------------------
def chat_with_agent(messages, user, config):
    """Blocking chat — collects all streaming chunks and returns full response."""
    content = ''
    tool_calls = []
    for event in stream_chat_with_agent(messages, user, config):
        if event['type'] == 'chunk':
            content += event['content']
        elif event['type'] == 'tool_calls':
            tool_calls = event.get('data', [])
    return {'content': content.strip(), 'tool_calls': tool_calls, 'tokens_used': 0}


# ---------------------------------------------------------------------------
# Groq streaming
# ---------------------------------------------------------------------------
def _extract_tool_calls(text):
    blocks = re.findall(r'```(?:tool|json)?\s*\n(.*?)\n```', text, re.DOTALL)
    calls = []
    for block in blocks:
        try:
            data = json.loads(block.strip())
            if isinstance(data, dict) and 'tool' in data:
                calls.append(data)
        except json.JSONDecodeError:
            pass
    return calls


def _stream_groq(messages, user, api_key, model_name, prefetched=''):
    from groq import Groq
    client = Groq(api_key=api_key)
    tool_registry = _get_tools_for_user(user)
    system_prompt = _build_system_prompt(user, prefetched)
    tool_desc = _build_tool_desc(tool_registry)

    groq_messages = [{'role': 'system', 'content': system_prompt + tool_desc}]
    for msg in messages[:-1]:
        groq_messages.append({'role': msg['role'], 'content': msg['content']})
    groq_messages.append({'role': 'user', 'content': messages[-1]['content']})

    model = model_name or 'llama-3.1-8b-instant'
    tool_calls_made = []

    # Quick non-streaming probe (max 200 tokens) to detect if tool calls are needed.
    # With pre-fetch this is rare, but handles specific lookups like "tell me about Acme Corp".
    probe = client.chat.completions.create(
        model=model, messages=groq_messages,
        temperature=0.2, max_tokens=200,
    )
    probe_text = probe.choices[0].message.content or ''
    calls = _extract_tool_calls(probe_text)

    if calls:
        # Execute tool calls, then stream the final answer
        tool_results = []
        for call in calls:
            tool_name = call.get('tool', '')
            args = call.get('args', {})
            if tool_name in tool_registry:
                try:
                    result = tool_registry[tool_name]['fn'](user=user, **args)
                    tool_calls_made.append({'tool': tool_name, 'args': args, 'result': 'success'})
                    tool_results.append(f"{tool_name}: {json.dumps(result, default=str, separators=(',', ':'))}")
                except Exception as e:
                    tool_results.append(f"{tool_name}: error - {e}")

        groq_messages.append({'role': 'assistant', 'content': probe_text})
        groq_messages.append({'role': 'user', 'content': (
            "Tool results:\n" + "\n".join(tool_results) +
            "\n\nNow give the user a clear, natural answer. No tool blocks."
        )})
    elif probe_text.strip() and '```tool' not in probe_text:
        # Probe already gave a good answer — stream it character by character
        clean = re.sub(r'```(?:tool|json)?\s*\n.*?\n```', '', probe_text, flags=re.DOTALL).strip()
        for char in clean:
            yield {'type': 'chunk', 'content': char}
        yield {'type': 'tool_calls', 'data': tool_calls_made}
        return

    # Stream the final LLM response
    try:
        stream = client.chat.completions.create(
            model=model, messages=groq_messages,
            temperature=0.4, max_tokens=1200, stream=True,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta.content or ''
            if delta:
                yield {'type': 'chunk', 'content': delta}
    except Exception as e:
        yield {'type': 'error', 'content': str(e)}

    yield {'type': 'tool_calls', 'data': tool_calls_made}


# ---------------------------------------------------------------------------
# Gemini streaming
# ---------------------------------------------------------------------------
def _stream_gemini(messages, user, api_key, model_name, prefetched=''):
    from google import genai
    client = genai.Client(api_key=api_key)
    tool_registry = _get_tools_for_user(user)
    system_prompt = _build_system_prompt(user, prefetched)
    tool_desc = _build_tool_desc(tool_registry)

    contents = []
    for msg in messages[:-1]:
        role = 'user' if msg['role'] == 'user' else 'model'
        contents.append({'role': role, 'parts': [{'text': msg['content']}]})
    contents.append({'role': 'user', 'parts': [{'text': messages[-1]['content'] + tool_desc}]})

    model = model_name or 'gemini-2.0-flash'
    cfg = {'system_instruction': system_prompt, 'max_output_tokens': 1200, 'temperature': 0.4}
    tool_calls_made = []

    try:
        # Probe for tool calls (non-streaming, fast)
        probe_cfg = {**cfg, 'max_output_tokens': 200}
        probe = client.models.generate_content(model=model, contents=contents, config=probe_cfg)
        probe_text = probe.text or ''
        calls = _extract_tool_calls(probe_text)

        if calls:
            tool_results = []
            for call in calls:
                tool_name = call.get('tool', '')
                args = call.get('args', {})
                if tool_name in tool_registry:
                    try:
                        result = tool_registry[tool_name]['fn'](user=user, **args)
                        tool_calls_made.append({'tool': tool_name, 'args': args, 'result': 'success'})
                        tool_results.append(f"{tool_name}: {json.dumps(result, default=str, separators=(',', ':'))}")
                    except Exception as e:
                        tool_results.append(f"{tool_name}: error - {e}")

            contents.append({'role': 'model', 'parts': [{'text': probe_text}]})
            contents.append({'role': 'user', 'parts': [{'text': (
                "Tool results:\n" + "\n".join(tool_results) +
                "\n\nNow give the user a clear, natural answer. No tool blocks."
            )}]})
        elif probe_text.strip() and '```tool' not in probe_text:
            clean = re.sub(r'```tool\s*\n.*?\n```', '', probe_text, flags=re.DOTALL).strip()
            for char in clean:
                yield {'type': 'chunk', 'content': char}
            yield {'type': 'tool_calls', 'data': []}
            return

        # Stream final response
        for chunk in client.models.generate_content_stream(model=model, contents=contents, config=cfg):
            text = chunk.text or ''
            if text:
                yield {'type': 'chunk', 'content': text}

    except Exception as e:
        yield {'type': 'error', 'content': str(e)}

    yield {'type': 'tool_calls', 'data': tool_calls_made}
