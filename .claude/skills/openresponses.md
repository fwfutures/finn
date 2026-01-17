# OpenResponses API Skill

Comprehensive guide for implementing the OpenResponses standard - a multi-provider, interoperable LLM interface specification.

## Overview

OpenResponses is an open-source specification launched January 2026, designed for agentic AI workloads. It provides a unified schema for calling language models, streaming results, and composing agentic workflows across providers.

**Key Partners**: OpenAI (initiator), OpenRouter, Hugging Face, Vercel AI SDK, LM Studio, vLLM, Ollama

**Specification**: https://www.openresponses.org/specification
**API Reference**: https://www.openresponses.org/reference

---

## Core Concepts

### Items (Atomic Unit)
Items are polymorphic objects discriminated by `type` field. Required properties:
- `id`: Unique identifier
- `type`: Schema type (standard or `implementor_slug:custom`)
- `status`: Lifecycle state (`in_progress`, `incomplete`, `completed`, `failed`)

### Standard Item Types
- `message`: role, content array, status
- `function_call`: name, arguments, call_id
- `function_call_output`: call_id, output
- `reasoning`: content, encrypted_content, summary

### Content Model (Asymmetric)
- **User content**: text, images (input_image), files, audio, video
- **Model content**: primarily `output_text`

---

## Endpoint

```
POST /v1/responses
```

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <API_KEY>` |
| `Content-Type` | Yes | `application/json` |
| `OpenResponses-Version` | Optional | Version hint (e.g., `latest`) |

---

## Request Schema

```typescript
interface CreateResponseRequest {
  // Required
  model: string;                           // e.g., "gpt-5.2", "anthropic/claude-4.5-sonnet"
  input: string | InputItem[];             // Prompt or message array

  // Sampling Controls
  temperature?: number;                    // 0-2, randomness
  top_p?: number;                          // 0-1, nucleus sampling
  top_k?: number;                          // Token filtering
  max_output_tokens?: number;              // Generation limit (min: 16)

  // Tool Integration
  tools?: Tool[];                          // Function definitions
  tool_choice?: ToolChoice;                // "auto" | "required" | "none" | specific
  allowed_tools?: string[];                // Subset for this request

  // Reasoning
  reasoning?: {
    effort?: "none" | "low" | "medium" | "high" | "xhigh";
  };

  // Streaming
  stream?: boolean;                        // Enable SSE responses

  // Context Management
  previous_response_id?: string;           // Resume conversation
  truncation?: "auto" | "disabled";        // Context overflow handling

  // Metadata
  metadata?: Record<string, string>;       // Max 16 pairs, 512 char values
  instructions?: string;                   // System-level guidance

  // Advanced
  service_tier?: "auto" | "default" | "flex" | "priority";
  store?: boolean;                         // Persist for retrieval
  background?: boolean;                    // Async execution
}
```

### Input Item Types

```typescript
// Message types
interface MessageItem {
  type: "message";
  role: "user" | "system" | "assistant" | "developer";
  content: string | ContentPart[];
}

// Content parts
type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail?: "auto" | "high" | "low" }
  | { type: "input_file"; file_id?: string; filename?: string; file_data?: string }
  | { type: "input_audio"; data: string; format: "mp3" | "wav" };

// Function call items
interface FunctionCallItem {
  type: "function_call";
  id?: string;
  call_id: string;
  name: string;
  arguments: string;
}

interface FunctionCallOutputItem {
  type: "function_call_output";
  call_id: string;
  output: string;
}

// Reasoning item
interface ReasoningItem {
  type: "reasoning";
  id?: string;
  content?: ContentPart[];
  encrypted_content?: string;
  summary?: ContentPart[];
  status?: "in_progress" | "completed" | "incomplete";
}
```

### Tool Definition

```typescript
interface Tool {
  type: "function";
  name: string;                            // alphanumeric, underscore, hyphen
  description?: string;
  parameters?: JSONSchema;                 // JSON Schema object
  strict?: boolean;                        // Enforce schema validation
}

type ToolChoice =
  | "auto"                                 // Model decides (default)
  | "required"                             // Must call at least one
  | "none"                                 // No tool calls allowed
  | { type: "function"; name: string };    // Force specific tool
```

---

## Response Schema

```typescript
interface Response {
  id: string;
  object: "response";
  created_at: number;                      // Unix timestamp
  completed_at?: number;
  model: string;
  status: "completed" | "incomplete" | "in_progress" | "failed" | "cancelled" | "queued";

  output: OutputItem[];

  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  };

  reasoning?: { summary?: string };
  error?: ResponseError;
}

// Output item types
type OutputItem =
  | { type: "message"; role: "assistant"; content: ContentPart[]; status: string }
  | { type: "function_call"; id: string; call_id: string; name: string; arguments: string; status: string }
  | { type: "reasoning"; id: string; content?: ContentPart[]; summary?: ContentPart[]; status: string };
```

---

## Streaming Events

When `stream: true`, responses are Server-Sent Events with `Content-Type: text/event-stream`.

### Event Format
```
event: <event_type>
data: <json_payload>

event: <event_type>
data: <json_payload>

data: [DONE]
```

### Event Types

**Lifecycle Events**
| Event | Description |
|-------|-------------|
| `response.created` | Response object created |
| `response.queued` | Request queued for processing |
| `response.in_progress` | Generation started |
| `response.completed` | Generation finished successfully |
| `response.failed` | Generation failed |
| `response.incomplete` | Generation stopped before completion |

**Output Events**
| Event | Description |
|-------|-------------|
| `response.output_item.added` | New output item started |
| `response.output_item.done` | Output item completed |
| `response.content_part.added` | New content part started |
| `response.content_part.done` | Content part completed |
| `response.output_text.delta` | Text chunk streamed |

**Reasoning Events**
| Event | Description |
|-------|-------------|
| `response.reasoning.delta` | Raw reasoning trace (open models) |
| `response.reasoning_summary_text.delta` | Sanitized reasoning summary |

### Streaming Example Payload

```json
// response.output_text.delta
{
  "type": "response.output_text.delta",
  "sequence_number": 5,
  "item_id": "item_abc123",
  "output_index": 0,
  "content_index": 0,
  "delta": "Hello, how can I"
}
```

---

## Error Handling

```typescript
interface ResponseError {
  type: "server_error" | "invalid_request" | "not_found" | "model_error" | "too_many_requests";
  code?: string;
  param?: string;
  message: string;
}
```

| Status | Type | Description |
|--------|------|-------------|
| 400 | `invalid_request` | Bad parameters |
| 401 | `unauthorized` | Authentication failed |
| 402 | `payment_required` | Insufficient credits |
| 404 | `not_found` | Resource missing |
| 408 | `request_timeout` | Timeout |
| 413 | `payload_too_large` | Input too large |
| 429 | `too_many_requests` | Rate limited |
| 500 | `server_error` | Internal error |

---

## Provider Implementations

### OpenRouter

**Endpoint**: `https://openrouter.ai/api/v1/responses`

```typescript
// OpenRouter-specific features
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

**Example**:
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

### OpenAI Native

**Endpoint**: `https://api.openai.com/v1/responses`

```typescript
// OpenAI-specific features
interface OpenAIRequest extends CreateResponseRequest {
  // Extended features
  include?: ("reasoning.encrypted_content" | "message.output_text.logprobs")[];
  verbosity?: "low" | "medium" | "high";
}
```

**Example**:
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

### Anthropic (via OpenAI Compatibility Layer)

**Note**: Anthropic provides OpenAI Chat Completions compatibility at `/v1/chat/completions`, NOT native OpenResponses support yet. Use OpenRouter for Anthropic models with OpenResponses.

**Endpoint**: `https://api.anthropic.com/v1/chat/completions` (Chat API only)

```typescript
// Using OpenAI SDK with Anthropic
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

**Limitations**:
- No native `/v1/responses` endpoint
- System messages hoisted and concatenated
- `strict` tool validation ignored
- Audio input ignored
- No prompt caching

### Local Models (LM Studio, Ollama)

**LM Studio Endpoint**: `http://127.0.0.1:1234/v1/responses`

```bash
curl http://127.0.0.1:1234/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "local-model",
    "input": "Hello!",
    "reasoning": {"effort": "medium"}
  }'
```

**MCP Tool Integration** (LM Studio):
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

## TypeScript Implementation

### Basic Client

```typescript
interface OpenResponsesConfig {
  apiKey: string;
  baseURL: string;
  defaultModel?: string;
}

class OpenResponsesClient {
  private config: OpenResponsesConfig;

  constructor(config: OpenResponsesConfig) {
    this.config = config;
  }

  async createResponse(request: CreateResponseRequest): Promise<Response> {
    const res = await fetch(`${this.config.baseURL}/v1/responses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: request.model || this.config.defaultModel,
        ...request,
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`API Error: ${error.message}`);
    }

    return res.json();
  }

  async *streamResponse(request: CreateResponseRequest): AsyncGenerator<StreamEvent> {
    const res = await fetch(`${this.config.baseURL}/v1/responses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...request,
        model: request.model || this.config.defaultModel,
        stream: true,
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`API Error: ${error.message}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          yield JSON.parse(data);
        }
      }
    }
  }
}
```

### Usage Examples

```typescript
// OpenRouter
const openrouter = new OpenResponsesClient({
  apiKey: process.env.OPENROUTER_API_KEY!,
  baseURL: 'https://openrouter.ai/api',
  defaultModel: 'anthropic/claude-4.5-sonnet',
});

// OpenAI
const openai = new OpenResponsesClient({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://api.openai.com',
  defaultModel: 'gpt-5.2',
});

// Non-streaming
const response = await openrouter.createResponse({
  input: [{ type: 'message', role: 'user', content: 'Hello!' }],
});
console.log(response.output[0]);

// Streaming
for await (const event of openrouter.streamResponse({
  input: 'Tell me a story',
})) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta);
  }
}

// With tools
const toolResponse = await openrouter.createResponse({
  input: [{ type: 'message', role: 'user', content: 'What is 2 + 2?' }],
  tools: [{
    type: 'function',
    name: 'calculator',
    description: 'Performs arithmetic',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string' }
      },
      required: ['expression']
    }
  }],
  tool_choice: 'auto',
});

// Handle tool calls
for (const item of toolResponse.output) {
  if (item.type === 'function_call') {
    console.log(`Tool: ${item.name}, Args: ${item.arguments}`);
  }
}
```

### Agentic Loop

```typescript
async function agenticLoop(
  client: OpenResponsesClient,
  initialInput: string,
  tools: Tool[],
  executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> {
  let currentInput: InputItem[] = [
    { type: 'message', role: 'user', content: initialInput }
  ];
  let previousResponseId: string | undefined;

  while (true) {
    const response = await client.createResponse({
      input: currentInput,
      tools,
      previous_response_id: previousResponseId,
    });

    previousResponseId = response.id;

    // Check for function calls
    const functionCalls = response.output.filter(
      (item): item is FunctionCallItem => item.type === 'function_call'
    );

    if (functionCalls.length === 0) {
      // No more tool calls, return final message
      const message = response.output.find(item => item.type === 'message');
      return message?.content?.[0]?.text || '';
    }

    // Execute tools and build next input
    currentInput = [];
    for (const call of functionCalls) {
      const result = await executeToolFn(call.name, JSON.parse(call.arguments));
      currentInput.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: result,
      });
    }
  }
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

## Best Practices

1. **Use `previous_response_id`** for multi-turn conversations instead of re-sending full history
2. **Set appropriate `truncation`** - use `"auto"` for long contexts, `"disabled"` for strict requirements
3. **Leverage streaming** for better UX with `response.output_text.delta` events
4. **Handle tool loops** with max iteration limits to prevent infinite loops
5. **Check item `status`** - items can be `incomplete` if generation was truncated
6. **Use provider routing** on OpenRouter for cost/latency optimization
7. **Cache responses** with `store: true` when building evaluation pipelines

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

---

## References

- [OpenResponses Specification](https://www.openresponses.org/specification)
- [OpenResponses API Reference](https://www.openresponses.org/reference)
- [OpenRouter Responses API](https://openrouter.ai/docs/api/api-reference/responses/create-responses)
- [Hugging Face Blog: Open Responses](https://huggingface.co/blog/open-responses)
- [Simon Willison Analysis](https://simonwillison.net/2026/Jan/15/open-responses/)
- [GitHub Repository](https://github.com/openresponses/openresponses)
