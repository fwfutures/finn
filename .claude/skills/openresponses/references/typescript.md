# TypeScript Implementation

## Table of Contents
- [Basic Client](#basic-client)
- [Usage Examples](#usage-examples)
- [Agentic Loop](#agentic-loop)

---

## Basic Client

```typescript
interface OpenResponsesConfig {
  apiKey: string;
  baseURL: string;
  defaultModel?: string;
}

interface StreamEvent {
  type: string;
  [key: string]: unknown;
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

---

## Usage Examples

### Initialize Clients

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
```

### Non-Streaming Request

```typescript
const response = await openrouter.createResponse({
  input: [{ type: 'message', role: 'user', content: 'Hello!' }],
});
console.log(response.output[0]);
```

### Streaming Request

```typescript
for await (const event of openrouter.streamResponse({
  input: 'Tell me a story',
})) {
  if (event.type === 'response.output_text.delta') {
    process.stdout.write(event.delta as string);
  }
}
```

### With Tools

```typescript
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

---

## Agentic Loop

Full implementation of a tool-calling loop that continues until the model stops requesting tools.

### With `previous_response_id` (Recommended)

Uses the provider's conversation state to automatically track history:

```typescript
async function agenticLoopWithState(
  client: OpenResponsesClient,
  initialInput: string,
  tools: Tool[],
  executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> {
  let currentInput: InputItem[] = [
    { type: 'message', role: 'user', content: initialInput }
  ];
  let previousResponseId: string | undefined;
  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.createResponse({
      input: currentInput,
      tools,
      previous_response_id: previousResponseId,
    });

    previousResponseId = response.id;

    const functionCalls = response.output.filter(
      (item): item is FunctionCallItem => item.type === 'function_call'
    );

    if (functionCalls.length === 0) {
      const message = response.output.find(item => item.type === 'message');
      if (message && 'content' in message) {
        const content = message.content as Array<{ type: string; text?: string }>;
        return content[0]?.text || '';
      }
      return '';
    }

    // With previous_response_id, only send tool outputs
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

  throw new Error('Max iterations reached');
}
```

### Without `previous_response_id` (Manual History)

**⚠️ Important**: When NOT using `previous_response_id`, you must include the full conversation history including `function_call` items before their outputs:

```typescript
async function agenticLoopManual(
  client: OpenResponsesClient,
  initialInput: string,
  tools: Tool[],
  executeToolFn: (name: string, args: Record<string, unknown>) => Promise<string>
): Promise<string> {
  // Accumulate full conversation history
  let conversationHistory: InputItem[] = [
    { type: 'message', role: 'user', content: initialInput }
  ];
  let iterations = 0;
  const maxIterations = 5;

  while (iterations < maxIterations) {
    iterations++;

    const response = await client.createResponse({
      input: conversationHistory,
      tools,
    });

    const functionCalls = response.output.filter(
      (item): item is FunctionCallItem => item.type === 'function_call'
    );

    if (functionCalls.length === 0) {
      const message = response.output.find(item => item.type === 'message');
      if (message && 'content' in message) {
        const content = message.content as Array<{ type: string; text?: string }>;
        return content[0]?.text || '';
      }
      return '';
    }

    // CRITICAL: Add BOTH function_call AND function_call_output to history
    for (const call of functionCalls) {
      // First, add the function_call item from the response
      conversationHistory.push({
        type: 'function_call',
        call_id: call.call_id,
        name: call.name,
        arguments: call.arguments,
      });

      // Then execute and add the output
      const result = await executeToolFn(call.name, JSON.parse(call.arguments));
      conversationHistory.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: result,
      });
    }
  }

  throw new Error('Max iterations reached');
}
```

### Example Usage

```typescript
const result = await agenticLoop(
  openrouter,
  'What is the weather in San Francisco and New York?',
  [{
    type: 'function',
    name: 'get_weather',
    description: 'Get current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' }
      },
      required: ['location']
    }
  }],
  async (name, args) => {
    if (name === 'get_weather') {
      // Mock weather API
      return JSON.stringify({ temp: 65, condition: 'sunny' });
    }
    throw new Error(`Unknown tool: ${name}`);
  }
);

console.log(result);
```
