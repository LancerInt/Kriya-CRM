"""AI Service — connects to LLM providers and executes CRM tool calls."""
import json
import logging
from .tools import TOOL_REGISTRY

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are Kriya AI, an intelligent assistant for the Kriya CRM trade management platform.
You help users manage their international trade business by providing insights, performing actions, and answering questions.

Your capabilities:
- Search and analyze client data
- View and create tasks
- Check orders, shipments, and invoices
- Analyze sales pipeline
- Summarize communications
- Provide business insights and recommendations

When users ask questions, use the available tools to fetch real data from the CRM before answering.
Always be concise, professional, and actionable. Format responses with markdown for readability.
When showing data, use tables or bullet points. When suggesting actions, be specific.
If you don't have enough information, ask clarifying questions.
Speak as a knowledgeable trade operations assistant."""


def _build_gemini_tools():
    """Convert our tool registry into Gemini function declarations."""
    tools = []
    for name, info in TOOL_REGISTRY.items():
        params = {}
        for pname, pdesc in info['parameters'].items():
            params[pname] = {'type': 'string', 'description': pdesc}

        tools.append({
            'name': name,
            'description': info['description'],
            'parameters': {
                'type': 'object',
                'properties': params,
            } if params else {'type': 'object', 'properties': {}},
        })
    return tools


def chat_with_agent(messages, user, config):
    """Send messages to LLM and handle tool calls. Returns assistant response."""
    from common.encryption import decrypt_value
    api_key = decrypt_value(config.api_key)
    provider = config.provider

    if provider == 'groq':
        return _chat_groq(messages, user, api_key, config.model_name)
    elif provider == 'gemini':
        return _chat_gemini(messages, user, api_key, config.model_name)
    elif provider == 'openai':
        return _chat_openai(messages, user, api_key, config.model_name)
    elif provider == 'claude':
        return _chat_claude(messages, user, api_key, config.model_name)
    else:
        return {'content': 'Unsupported AI provider', 'tool_calls': []}


def _chat_gemini(messages, user, api_key, model_name):
    """Chat using Google Gemini (new SDK)."""
    from google import genai

    client = genai.Client(api_key=api_key)
    last_message = messages[-1]['content']

    # First call — may trigger tool use
    tool_calls_made = []
    max_iterations = 5

    # Build tool descriptions into the prompt
    tool_desc = "\n\nYou have access to these CRM tools. To use them, respond with a JSON block like: ```tool\n{\"tool\": \"tool_name\", \"args\": {\"param\": \"value\"}}\n```\n\nAvailable tools:\n"
    for name, info in TOOL_REGISTRY.items():
        params_str = ', '.join(f'{k}: {v}' for k, v in info['parameters'].items())
        tool_desc += f"- **{name}**({params_str}): {info['description']}\n"

    tool_desc += "\nYou can call multiple tools. After getting tool results, synthesize them into a helpful response. Always call tools when you need real data — never make up numbers."

    enhanced_message = last_message + tool_desc

    # Build conversation for Gemini
    contents = [{'role': 'user', 'parts': [{'text': SYSTEM_PROMPT + '\n\n' + enhanced_message}]}]
    if len(messages) > 1:
        contents = []
        for msg in messages[:-1]:
            role = 'user' if msg['role'] == 'user' else 'model'
            contents.append({'role': role, 'parts': [{'text': msg['content']}]})
        contents.append({'role': 'user', 'parts': [{'text': enhanced_message}]})

    response = client.models.generate_content(
        model=model_name or 'gemini-2.0-flash',
        contents=contents,
        config={'system_instruction': SYSTEM_PROMPT},
    )
    response_text = response.text

    # Check for tool calls in response
    for iteration in range(max_iterations):
        if '```tool' not in response_text:
            break

        import re
        tool_blocks = re.findall(r'```tool\s*\n(.*?)\n```', response_text, re.DOTALL)

        tool_results = []
        for block in tool_blocks:
            try:
                call = json.loads(block)
                tool_name = call.get('tool', '')
                args = call.get('args', {})

                if tool_name in TOOL_REGISTRY:
                    logger.info(f'Agent calling tool: {tool_name}({args})')
                    result = TOOL_REGISTRY[tool_name]['fn'](user=user, **args)
                    tool_calls_made.append({'tool': tool_name, 'args': args, 'result': 'success'})
                    tool_results.append(f"Result of {tool_name}: {json.dumps(result, default=str)}")
                else:
                    tool_results.append(f"Error: Unknown tool '{tool_name}'")
            except (json.JSONDecodeError, Exception) as e:
                tool_results.append(f"Error executing tool: {str(e)}")

        if tool_results:
            results_message = "Here are the tool results:\n\n" + "\n\n".join(tool_results) + "\n\nNow provide a helpful response to the user based on this data. Do NOT include tool call blocks in your final response."
            contents.append({'role': 'model', 'parts': [{'text': response_text}]})
            contents.append({'role': 'user', 'parts': [{'text': results_message}]})
            response = client.models.generate_content(
                model=model_name or 'gemini-2.0-flash',
                contents=contents,
            )
            response_text = response.text

    import re
    response_text = re.sub(r'```tool\s*\n.*?\n```', '', response_text, flags=re.DOTALL).strip()

    return {
        'content': response_text,
        'tool_calls': tool_calls_made,
        'tokens_used': 0,
    }


def _extract_tool_calls(text):
    """Extract tool call JSON from any code block format (```tool, ```json, or raw JSON)."""
    import re
    # Match ```tool, ```json, or ``` blocks containing tool calls
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


def _clean_tool_blocks(text):
    """Remove all code blocks that contain tool calls from response."""
    import re
    return re.sub(r'```(?:tool|json)?\s*\n\s*\{[^`]*?"tool"[^`]*?\}\s*\n```', '', text, flags=re.DOTALL).strip()


def _chat_groq(messages, user, api_key, model_name):
    """Chat using Groq (free Llama models)."""
    from groq import Groq

    client = Groq(api_key=api_key)

    # Build tool descriptions — instruct to use ```tool blocks
    tool_desc = """

IMPORTANT: You have CRM database tools. When you need real data, call a tool using EXACTLY this format (use ```tool NOT ```json):

```tool
{"tool": "tool_name", "args": {"param": "value"}}
```

Available tools:
"""
    for name, info in TOOL_REGISTRY.items():
        params_str = ', '.join(f'{k}: {v}' for k, v in info['parameters'].items())
        tool_desc += f"- {name}({params_str}): {info['description']}\n"
    tool_desc += """
RULES:
- ALWAYS call a tool when you need data. Never guess or make up numbers.
- After you call a tool, I will give you the results, then you provide the final answer.
- Do NOT show tool call blocks in your final answer to the user."""

    # Build messages
    groq_messages = [{'role': 'system', 'content': SYSTEM_PROMPT + tool_desc}]
    for msg in messages[:-1]:
        groq_messages.append({'role': msg['role'], 'content': msg['content']})
    groq_messages.append({'role': 'user', 'content': messages[-1]['content']})

    tool_calls_made = []

    response = client.chat.completions.create(
        model=model_name or 'llama-3.3-70b-versatile',
        messages=groq_messages,
        temperature=0.3,
        max_tokens=4096,
    )
    response_text = response.choices[0].message.content or ''

    # Handle tool calls (up to 3 rounds)
    for iteration in range(3):
        calls = _extract_tool_calls(response_text)
        if not calls:
            break

        tool_results = []
        for call in calls:
            tool_name = call.get('tool', '')
            args = call.get('args', {})
            if tool_name in TOOL_REGISTRY:
                logger.info(f'Agent calling tool: {tool_name}({args})')
                try:
                    result = TOOL_REGISTRY[tool_name]['fn'](user=user, **args)
                    tool_calls_made.append({'tool': tool_name, 'args': args, 'result': 'success'})
                    tool_results.append(f"[{tool_name}]: {json.dumps(result, default=str)}")
                except Exception as e:
                    tool_results.append(f"[{tool_name}]: Error - {str(e)}")
            else:
                tool_results.append(f"[{tool_name}]: Unknown tool")

        groq_messages.append({'role': 'assistant', 'content': response_text})
        groq_messages.append({'role': 'user', 'content': "Here are the tool results:\n\n" + "\n\n".join(tool_results) + "\n\nNow give the user a clear, well-formatted answer based on this real data. Use markdown tables/bullets. Do NOT include any tool call blocks."})

        response = client.chat.completions.create(
            model=model_name or 'llama-3.3-70b-versatile',
            messages=groq_messages,
            temperature=0.3,
            max_tokens=4096,
        )
        response_text = response.choices[0].message.content or ''

    # Clean any remaining tool blocks
    response_text = _clean_tool_blocks(response_text)

    return {
        'content': response_text,
        'tool_calls': tool_calls_made,
        'tokens_used': response.usage.total_tokens if response.usage else 0,
    }


def _chat_openai(messages, user, api_key, model_name):
    """Placeholder for OpenAI."""
    return {'content': 'OpenAI integration coming soon.', 'tool_calls': []}


def _chat_claude(messages, user, api_key, model_name):
    """Placeholder for Claude."""
    return {'content': 'Claude integration coming soon.', 'tool_calls': []}
