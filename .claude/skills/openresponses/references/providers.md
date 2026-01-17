# Provider Implementations

## Table of Contents
- [OpenRouter](#openrouter)
- [OpenAI Native](#openai-native)
- [Anthropic](#anthropic)
- [Local Models](#local-models)
- [Format Conversion](#format-conversion)

---

## OpenRouter

**Endpoint**: `https://openrouter.ai/api/v1/responses`

Full OpenResponses support with additional routing and plugin features.

### OpenRouter-Specific Options

```typescript
interface OpenRouterRequest extends CreateResponseRequest {
  // Plugin support
  plugins?: ("auto-router" | "moderation" | "web_search" | "file-parser")[];

  // Provider routing
  provider?: {
    order?: string[];                      // Provider preference
    allow_fallbacks?: boolean;
    require_parameters?: boolean;
    data_collection?: "allow" | "deny";
    max_price?: { prompt: number; completion: number };
  };

  // Cache
  prompt_cache_key?: string;

  // Output format
  text?: {
    format: "text" | "json_object" | { type: "json_schema"; schema: JSONSchema };
  };
}
```

### Example

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-4.5-sonnet",
    "input": [
      {"type": "message", "role": "user", "content": "Hello!"}
    ],
    "temperature": 0.7
  }'
```

---

## OpenAI Native

**Endpoint**: `https://api.openai.com/v1/responses`

Native OpenResponses support with extended features.

### OpenAI-Specific Options

```typescript
interface OpenAIRequest extends CreateResponseRequest {
  // Extended features
  include?: ("reasoning.encrypted_content" | "message.output_text.logprobs")[];
  verbosity?: "low" | "medium" | "high";
}
```

### Example

```bash
curl https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.2",
    "input": "Explain quantum computing",
    "reasoning": {"effort": "high"},
    "stream": true
  }'
```

---

## Anthropic

**Note**: Anthropic does NOT have a native `/v1/responses` endpoint. There are two options:

### Option 1: OpenRouter (Recommended for OpenResponses)

Use OpenRouter to access Anthropic models via the OpenResponses API:

```bash
curl https://openrouter.ai/api/v1/responses \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-sonnet-4",
    "input": "Hello!",
    "tools": [{
      "type": "function",
      "name": "get_weather",
      "parameters": {"type": "object", "properties": {"city": {"type": "string"}}}
    }],
    "tool_choice": "required"
  }'
```

**Tested models via OpenRouter**:
- `anthropic/claude-sonnet-4` - Fast, capable
- `anthropic/claude-opus-4` - Most capable
- `anthropic/claude-haiku-4` - Fastest, cheapest

### Option 2: Chat Completions API (Direct)

**Endpoint**: `https://api.anthropic.com/v1/chat/completions` (Chat API only)

### Using OpenAI SDK with Anthropic

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com/v1/',
});

const response = await client.chat.completions.create({
  model: 'claude-sonnet-4-5',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Limitations
- No native `/v1/responses` endpoint
- System messages hoisted and concatenated
- `strict` tool validation ignored
- Audio input ignored
- No prompt caching

---

## Local Models

### LM Studio

**Endpoint**: `http://127.0.0.1:1234/v1/responses`

```bash
curl http://127.0.0.1:1234/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-model",
    "input": "Hello!",
    "reasoning": {"effort": "medium"}
  }'
```

### MCP Tool Integration (LM Studio)

```json
{
  "model": "local-model",
  "tools": [{
    "type": "mcp",
    "server_label": "my-mcp-server",
    "server_url": "https://example.com/mcp",
    "allowed_tools": ["search", "fetch"]
  }],
  "input": "Search for recent news"
}
```

---

## Format Conversion

### OpenAI Chat → OpenResponses

```typescript
function chatToOpenResponses(messages: ChatMessage[]): InputItem[] {
  return messages.map(msg => ({
    type: 'message',
    role: msg.role,
    content: typeof msg.content === 'string'
      ? msg.content
      : msg.content.map(part => {
          if (part.type === 'text') return { type: 'input_text', text: part.text };
          if (part.type === 'image_url') return { type: 'input_image', image_url: part.image_url.url };
          return part;
        }),
  }));
}
```

### OpenResponses → Anthropic Native

```typescript
function openResponsesToAnthropic(input: InputItem[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];
  let systemPrompt = '';

  for (const item of input) {
    if (item.type !== 'message') continue;

    if (item.role === 'system' || item.role === 'developer') {
      systemPrompt += (systemPrompt ? '\n' : '') + extractText(item.content);
      continue;
    }

    messages.push({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: convertContent(item.content),
    });
  }

  return { system: systemPrompt, messages };
}
```

---

## Extension Mechanism

Custom item types must be prefixed with implementor slug:

```typescript
// Custom item type
interface CustomSearchResult {
  type: "acme:search_result";
  id: string;
  query: string;
  results: { title: string; url: string }[];
  status: "completed";
}
```

Custom streaming events follow the same pattern:
```
event: acme:search_started
data: {"query": "..."}
```
