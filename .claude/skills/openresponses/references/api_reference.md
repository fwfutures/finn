# OpenResponses API Reference

## Table of Contents
- [Request Schema](#request-schema)
- [Response Schema](#response-schema)
- [Streaming Events](#streaming-events)
- [Error Handling](#error-handling)

---

## Request Schema

### Headers
| Header | Required | Description |
|--------|----------|-------------|
| `Authorization` | Yes | `Bearer <API_KEY>` |
| `Content-Type` | Yes | `application/json` |
| `OpenResponses-Version` | Optional | Version hint (e.g., `latest`) |

### CreateResponseRequest

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

### Event Format
```
event: <event_type>
data: <json_payload>

event: <event_type>
data: <json_payload>

data: [DONE]
```

### Lifecycle Events
| Event | Description |
|-------|-------------|
| `response.created` | Response object created |
| `response.queued` | Request queued for processing |
| `response.in_progress` | Generation started |
| `response.completed` | Generation finished successfully |
| `response.failed` | Generation failed |
| `response.incomplete` | Generation stopped before completion |

### Output Events
| Event | Description |
|-------|-------------|
| `response.output_item.added` | New output item started |
| `response.output_item.done` | Output item completed |
| `response.content_part.added` | New content part started |
| `response.content_part.done` | Content part completed |
| `response.output_text.delta` | Text chunk streamed |

### Reasoning Events
| Event | Description |
|-------|-------------|
| `response.reasoning.delta` | Raw reasoning trace (open models) |
| `response.reasoning_summary_text.delta` | Sanitized reasoning summary |

### Delta Payload Example
```json
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
