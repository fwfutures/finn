---
name: openresponses
description: |
  Implement the OpenResponses specification - a multi-provider, interoperable LLM interface.
  Use when: (1) Building clients for OpenResponses API, (2) Working with OpenRouter, OpenAI,
  or local model providers via /v1/responses endpoint, (3) Converting between Chat Completions
  and OpenResponses formats, (4) Implementing agentic tool-calling loops, (5) Handling
  streaming SSE responses from LLM providers.
---

# OpenResponses API

Multi-provider LLM interface specification for agentic workloads. Unified schema for calling models, streaming results, and composing agentic workflows.

**Endpoint**: `POST /v1/responses`

**Key Partners**: OpenAI, OpenRouter, Hugging Face, Vercel AI SDK, LM Studio, vLLM, Ollama

## Core Concepts

### Items (Atomic Unit)
Polymorphic objects with `id`, `type`, and `status` (`in_progress`|`incomplete`|`completed`|`failed`).

**Standard Types**:
- `message` - role + content array
- `function_call` - name, arguments, call_id
- `function_call_output` - call_id, output
- `reasoning` - content, encrypted_content, summary

### Content Model (Asymmetric)
- **User**: `input_text`, `input_image`, `input_file`, `input_audio`
- **Model**: `output_text`

## Quick Reference

### Minimal Request
```json
{
  "model": "anthropic/claude-4.5-sonnet",
  "input": "Hello!"
}
```

### With Messages
```json
{
  "model": "gpt-5.2",
  "input": [
    {"type": "message", "role": "user", "content": "What is 2+2?"}
  ],
  "tools": [{
    "type": "function",
    "name": "calculator",
    "parameters": {"type": "object", "properties": {"expr": {"type": "string"}}}
  }]
}
```

### Key Parameters
| Parameter | Description |
|-----------|-------------|
| `model` | Model ID (e.g., `anthropic/claude-4.5-sonnet`) |
| `input` | String or `InputItem[]` |
| `stream` | Enable SSE streaming |
| `tools` | Function definitions |
| `tool_choice` | `auto`\|`required`\|`none`\|`{type,name}` |
| `reasoning` | `{effort: "none"\|"low"\|"medium"\|"high"}` |
| `previous_response_id` | Resume conversation |
| `max_output_tokens` | Generation limit |

## Provider Endpoints

| Provider | Endpoint | Notes |
|----------|----------|-------|
| OpenRouter | `https://openrouter.ai/api/v1/responses` | Full support, routing options |
| OpenAI | `https://api.openai.com/v1/responses` | Native support |
| LM Studio | `http://127.0.0.1:1234/v1/responses` | Local models |
| Anthropic | N/A | Use OpenRouter or Chat Completions |

## Streaming

Enable with `stream: true`. Response is SSE with `Content-Type: text/event-stream`.

**Key Events**:
- `response.created` / `response.completed` / `response.failed`
- `response.output_text.delta` - Text chunks
- `response.output_item.added` / `response.output_item.done`

**Format**:
```
event: response.output_text.delta
data: {"delta": "Hello", "item_id": "item_123"}

data: [DONE]
```

## Tool Calling Loop

```typescript
while (true) {
  const response = await client.createResponse({ input, tools, previous_response_id });
  const calls = response.output.filter(i => i.type === 'function_call');

  if (calls.length === 0) break; // Done - return message

  input = calls.map(call => ({
    type: 'function_call_output',
    call_id: call.call_id,
    output: await executeTool(call.name, JSON.parse(call.arguments))
  }));
  previous_response_id = response.id;
}
```

### Manual History (without `previous_response_id`)

**⚠️ Critical**: When NOT using `previous_response_id`, you must include the `function_call` items in the input array before the `function_call_output`. The API requires seeing the original tool call that matches each `call_id`.

```typescript
// ❌ WRONG - will fail with "No tool call found for function call output"
input: [
  { type: "message", role: "user", content: "Calculate 15 * 7" },
  { type: "function_call_output", call_id: "call_abc", output: "105" }
]

// ✅ CORRECT - include the function_call before its output
input: [
  { type: "message", role: "user", content: "Calculate 15 * 7" },
  { type: "function_call", call_id: "call_abc", name: "calculator", arguments: '{"expr":"15*7"}' },
  { type: "function_call_output", call_id: "call_abc", output: "105" }
]
```

## Best Practices

1. Use `previous_response_id` for multi-turn instead of re-sending history
2. Set `truncation: "auto"` for long contexts
3. Handle `status: "incomplete"` on items (generation truncated)
4. Limit tool loops (max 3-5 iterations)
5. Use provider routing on OpenRouter for cost optimization

## Common Pitfalls

### Tool Choice Options

| Value | Behavior | Notes |
|-------|----------|-------|
| `"auto"` | Model decides | Default, may not always call tools |
| `"required"` | Must call ≥1 tool | Most reliable for forcing tool use |
| `"none"` | No tools allowed | Useful for final response after tool execution |
| `{ type: "function", name: "X" }` | Force specific tool | May vary by provider |

**Tip**: Use `tool_choice: "required"` when you need guaranteed tool execution. Specific function targeting may not work reliably across all providers.

### Response Output Structure

Responses may contain **multiple output items** of different types:

```typescript
// Response can have both message AND function_call items
const response = await client.createResponse({ ... });

// Extract by type - don't assume order or single item
const message = response.output.find(i => i.type === 'message');
const toolCalls = response.output.filter(i => i.type === 'function_call');

// Check for tool calls first
if (toolCalls.length > 0) {
  // Handle tool execution
} else if (message) {
  // Extract final text
  const text = message.content[0]?.text;
}
```

### Anthropic via OpenRouter

Anthropic models don't have native `/v1/responses` support, but work through OpenRouter's proxy:

```typescript
// Use OpenRouter endpoint with Anthropic model
const response = await fetch('https://openrouter.ai/api/v1/responses', {
  headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}` },
  body: JSON.stringify({
    model: 'anthropic/claude-sonnet-4',  // Anthropic model via OpenRouter
    input: 'Hello!',
  }),
});
```

## References

- **Full schemas**: See [references/api_reference.md](references/api_reference.md)
- **Provider details**: See [references/providers.md](references/providers.md)
- **TypeScript client**: See [references/typescript.md](references/typescript.md)

## External Links

- [Specification](https://www.openresponses.org/specification)
- [API Reference](https://www.openresponses.org/reference)
- [OpenRouter Docs](https://openrouter.ai/docs/api/api-reference/responses/create-responses)
