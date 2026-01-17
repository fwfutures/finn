/**
 * Integration tests for OpenResponses API (/v1/responses)
 *
 * OpenResponses is a multi-provider, interoperable LLM interface.
 * - OpenRouter: https://openrouter.ai/api/v1/responses (full support)
 * - OpenAI: https://api.openai.com/v1/responses (native)
 *
 * Anthropic doesn't have a native /v1/responses endpoint, but models
 * can be accessed via OpenRouter's proxy.
 *
 * Environment variables:
 * - RUN_INTEGRATION=1 (defaults to true if .env exists)
 * - OPENROUTER_API_KEY (required for OpenRouter tests)
 * - OPENAI_API_KEY (optional, for direct OpenAI tests)
 * - OPENRESPONSES_MODEL (default: openai/gpt-4.1-mini)
 * - OPENRESPONSES_ANTHROPIC_MODEL (default: anthropic/claude-sonnet-4)
 *
 * Run this test file separately to avoid database conflicts:
 *   bun test src/ai/__tests__/openresponses.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Environment setup
// ─────────────────────────────────────────────────────────────────────────────

const tmpDir = mkdtempSync("/tmp/finn-openresponses-test-");

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const contents = readFileSync(filePath, "utf-8");
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(join(process.cwd(), ".env"));

// Set test defaults
process.env.PORT ||= "3004";
process.env.HOST ||= "0.0.0.0";
process.env.PUBLIC_URL ||= "https://example.com";
process.env.SLACK_BOT_TOKEN ||= "xoxb-test";
process.env.SLACK_APP_TOKEN ||= "xapp-test";
process.env.SLACK_SIGNING_SECRET ||= "test-signing-secret";
process.env.ANTHROPIC_API_KEY ||= "sk-ant-test";
process.env.OPENROUTER_API_KEY ||= "sk-or-test";
process.env.GOOGLE_CLIENT_ID ||= "test-google-client";
process.env.GOOGLE_CLIENT_SECRET ||= "test-google-secret";
process.env.ALLOWED_EMAILS ||= "test@example.com";
process.env.DATABASE_PATH = join(tmpDir, "finn.db");
process.env.SESSION_SECRET ||= "12345678901234567890123456789012";
process.env.DEFAULT_MODEL ||= "claude-opus";
process.env.DEFAULT_SYSTEM_PROMPT ||= "You are Finn, a helpful AI assistant.";

const runIntegration =
  process.env.RUN_INTEGRATION !== undefined
    ? process.env.RUN_INTEGRATION === "1"
    : true;

const hasRealOpenRouterKey =
  !!process.env.OPENROUTER_API_KEY &&
  process.env.OPENROUTER_API_KEY !== "sk-or-test";

const hasRealOpenAIKey =
  !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "sk-test";

// Test models
const openResponsesModel =
  process.env.OPENRESPONSES_MODEL || "openai/gpt-4.1-mini";
const openResponsesAnthropicModel =
  process.env.OPENRESPONSES_ANTHROPIC_MODEL || "anthropic/claude-sonnet-4";

// ─────────────────────────────────────────────────────────────────────────────
// Types (OpenResponses API)
// ─────────────────────────────────────────────────────────────────────────────

interface OpenResponsesRequest {
  model: string;
  input: string | InputItem[];
  instructions?: string;
  tools?: Tool[];
  tool_choice?: "auto" | "none" | "required" | { type: "function"; name: string };
  temperature?: number;
  max_output_tokens?: number;
  stream?: boolean;
}

type InputItem =
  | { type: "message"; role: "user" | "assistant" | "system"; content: string | ContentPart[] }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

interface ContentPart {
  type: "input_text" | "output_text" | "input_image" | "input_file";
  text?: string;
  image_url?: string;
  file_id?: string;
}

interface Tool {
  type: "function";
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  strict?: boolean;
}

interface OpenResponsesResponse {
  id: string;
  object: "response";
  created_at: number;
  completed_at?: number;
  model: string;
  status: "completed" | "incomplete" | "in_progress" | "failed";
  output: OutputItem[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

type OutputItem =
  | {
      type: "message";
      id: string;
      role: "assistant";
      content: Array<{ type: "output_text"; text: string }>;
      status: "completed" | "incomplete";
    }
  | {
      type: "function_call";
      id: string;
      call_id: string;
      name: string;
      arguments: string;
      status: "completed";
    };

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Call OpenResponses API
// ─────────────────────────────────────────────────────────────────────────────

async function callOpenResponses(
  endpoint: string,
  apiKey: string,
  request: OpenResponsesRequest
): Promise<OpenResponsesResponse> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenResponses API error: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  return response.json() as Promise<OpenResponsesResponse>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Database setup
// ─────────────────────────────────────────────────────────────────────────────

let closeDatabase: (() => void) | undefined;

beforeAll(async () => {
  const store = await import("../../store");
  store.initializeDatabase();
  closeDatabase = store.closeDatabase;
});

afterAll(() => {
  closeDatabase?.();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit Tests (mocked)
// ─────────────────────────────────────────────────────────────────────────────

describe("OpenResponses API format", () => {
  it("parses a simple text response", () => {
    const response: OpenResponsesResponse = {
      id: "resp_123",
      object: "response",
      created_at: Date.now(),
      completed_at: Date.now(),
      model: "openai/gpt-4.1-mini",
      status: "completed",
      output: [
        {
          type: "message",
          id: "msg_1",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello, world!" }],
          status: "completed",
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        total_tokens: 15,
      },
    };

    expect(response.status).toBe("completed");
    expect(response.output[0]?.type).toBe("message");

    const message = response.output[0] as Extract<OutputItem, { type: "message" }>;
    expect(message.content[0]?.text).toBe("Hello, world!");
  });

  it("parses a tool call response", () => {
    const response: OpenResponsesResponse = {
      id: "resp_456",
      object: "response",
      created_at: Date.now(),
      model: "openai/gpt-4.1-mini",
      status: "completed",
      output: [
        {
          type: "function_call",
          id: "fc_1",
          call_id: "call_abc123",
          name: "get_weather",
          arguments: '{"location": "San Francisco"}',
          status: "completed",
        },
      ],
      usage: {
        input_tokens: 20,
        output_tokens: 15,
        total_tokens: 35,
      },
    };

    expect(response.output[0]?.type).toBe("function_call");

    const toolCall = response.output[0] as Extract<OutputItem, { type: "function_call" }>;
    expect(toolCall.name).toBe("get_weather");
    expect(JSON.parse(toolCall.arguments)).toEqual({ location: "San Francisco" });
  });

  it("constructs a valid request with tools", () => {
    const request: OpenResponsesRequest = {
      model: "openai/gpt-4.1-mini",
      input: [
        {
          type: "message",
          role: "user",
          content: "What's the weather in Tokyo?",
        },
      ],
      instructions: "You are a helpful assistant.",
      tools: [
        {
          type: "function",
          name: "get_weather",
          description: "Get current weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "City name" },
            },
            required: ["location"],
          },
        },
      ],
      tool_choice: "auto",
    };

    expect(request.tools?.length).toBe(1);
    expect(request.tools?.[0]?.name).toBe("get_weather");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration Tests: OpenRouter /v1/responses
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration: OpenRouter /v1/responses", () => {
  if (!runIntegration || !hasRealOpenRouterKey) {
    it.skip("requires RUN_INTEGRATION=1 and a real OPENROUTER_API_KEY", () => {});
    return;
  }

  const endpoint = "https://openrouter.ai/api/v1/responses";
  const apiKey = process.env.OPENROUTER_API_KEY!;

  it(
    "sends a simple text request and receives a response",
    { timeout: 60000 },
    async () => {
      const response = await callOpenResponses(endpoint, apiKey, {
        model: openResponsesModel,
        input: "Say hello in exactly 3 words.",
      });

      expect(response.object).toBe("response");
      expect(response.status).toBe("completed");
      expect(response.output.length).toBeGreaterThan(0);
      expect(response.usage.total_tokens).toBeGreaterThan(0);

      // Extract text from response
      const message = response.output.find((o) => o.type === "message") as
        | Extract<OutputItem, { type: "message" }>
        | undefined;
      expect(message).toBeDefined();
      expect(message?.content[0]?.text?.length).toBeGreaterThan(0);

      console.log(`OpenRouter response (${openResponsesModel}):`, message?.content[0]?.text);
    }
  );

  it(
    "sends a request with message array input",
    { timeout: 60000 },
    async () => {
      const response = await callOpenResponses(endpoint, apiKey, {
        model: openResponsesModel,
        input: [
          { type: "message", role: "user", content: "What is 2 + 2?" },
        ],
        instructions: "You are a math tutor. Answer concisely.",
      });

      expect(response.status).toBe("completed");

      const message = response.output.find((o) => o.type === "message") as
        | Extract<OutputItem, { type: "message" }>
        | undefined;
      expect(message?.content[0]?.text).toContain("4");
    }
  );

  it(
    "executes a tool call and continues the conversation",
    { timeout: 90000 },
    async () => {
      // First request: expect a tool call
      const response1 = await callOpenResponses(endpoint, apiKey, {
        model: openResponsesModel,
        input: [
          {
            type: "message",
            role: "user",
            content: "Use the calculator tool to compute 15 * 7",
          },
        ],
        instructions: "You must use tools when asked to calculate.",
        tools: [
          {
            type: "function",
            name: "calculator",
            description: "Performs arithmetic calculations",
            parameters: {
              type: "object",
              properties: {
                expression: {
                  type: "string",
                  description: "The arithmetic expression to evaluate",
                },
              },
              required: ["expression"],
            },
          },
        ],
        tool_choice: { type: "function", name: "calculator" },
      });

      expect(response1.status).toBe("completed");

      // Find the tool call in output
      const toolCall = response1.output.find((o) => o.type === "function_call") as
        | Extract<OutputItem, { type: "function_call" }>
        | undefined;

      expect(toolCall).toBeDefined();
      expect(toolCall?.name).toBe("calculator");

      const args = JSON.parse(toolCall!.arguments) as { expression: string };
      console.log(`Tool call arguments:`, args);

      // Execute the "tool" (mock calculation)
      const result = "105"; // 15 * 7

      // Second request: provide tool result
      // Must include the original user message, the function call, and the function output
      const response2 = await callOpenResponses(endpoint, apiKey, {
        model: openResponsesModel,
        input: [
          {
            type: "message",
            role: "user",
            content: "Use the calculator tool to compute 15 * 7",
          },
          {
            type: "function_call",
            call_id: toolCall!.call_id,
            name: toolCall!.name,
            arguments: toolCall!.arguments,
          },
          {
            type: "function_call_output",
            call_id: toolCall!.call_id,
            output: result,
          },
        ],
        instructions: "Report the calculation result to the user.",
        tools: [
          {
            type: "function",
            name: "calculator",
            description: "Performs arithmetic calculations",
            parameters: {
              type: "object",
              properties: {
                expression: { type: "string" },
              },
              required: ["expression"],
            },
          },
        ],
      });

      expect(response2.status).toBe("completed");

      const finalMessage = response2.output.find((o) => o.type === "message") as
        | Extract<OutputItem, { type: "message" }>
        | undefined;
      expect(finalMessage).toBeDefined();
      expect(finalMessage?.content[0]?.text).toContain("105");

      console.log(`Final response:`, finalMessage?.content[0]?.text);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration Tests: Anthropic models via OpenRouter
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration: Anthropic via OpenRouter /v1/responses", () => {
  if (!runIntegration || !hasRealOpenRouterKey) {
    it.skip("requires RUN_INTEGRATION=1 and a real OPENROUTER_API_KEY", () => {});
    return;
  }

  const endpoint = "https://openrouter.ai/api/v1/responses";
  const apiKey = process.env.OPENROUTER_API_KEY!;

  it(
    "sends a request to an Anthropic model and receives a response",
    { timeout: 90000 },
    async () => {
      const response = await callOpenResponses(endpoint, apiKey, {
        model: openResponsesAnthropicModel,
        input: "What company created you? Answer in one word.",
        max_output_tokens: 50,
      });

      expect(response.object).toBe("response");
      expect(response.status).toBe("completed");
      expect(response.model).toContain("anthropic");

      const message = response.output.find((o) => o.type === "message") as
        | Extract<OutputItem, { type: "message" }>
        | undefined;
      expect(message).toBeDefined();

      const text = message?.content[0]?.text?.toLowerCase() || "";
      expect(text).toContain("anthropic");

      console.log(`Anthropic response (${openResponsesAnthropicModel}):`, message?.content[0]?.text);
    }
  );

  it(
    "executes tool calling with Anthropic model",
    { timeout: 90000 },
    async () => {
      const response = await callOpenResponses(endpoint, apiKey, {
        model: openResponsesAnthropicModel,
        input: [
          {
            type: "message",
            role: "user",
            content: "You must use the add_numbers tool right now. Add 5 and 3.",
          },
        ],
        instructions: "You MUST use the add_numbers tool when asked to add numbers. Do not respond without using the tool first.",
        tools: [
          {
            type: "function",
            name: "add_numbers",
            description: "Adds two numbers together. You MUST use this tool when asked to add.",
            parameters: {
              type: "object",
              properties: {
                a: { type: "number", description: "First number" },
                b: { type: "number", description: "Second number" },
              },
              required: ["a", "b"],
            },
          },
        ],
        tool_choice: "required",
        max_output_tokens: 1024,
      });

      expect(response.status).toBe("completed");

      const toolCall = response.output.find((o) => o.type === "function_call") as
        | Extract<OutputItem, { type: "function_call" }>
        | undefined;

      expect(toolCall).toBeDefined();
      expect(toolCall?.name).toBe("add_numbers");

      const args = JSON.parse(toolCall!.arguments) as { a: number; b: number };
      console.log(`Anthropic tool call: ${toolCall?.name}(${args.a}, ${args.b})`);
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration Tests: Direct OpenAI /v1/responses (optional)
// ─────────────────────────────────────────────────────────────────────────────

describe("Integration: OpenAI /v1/responses (direct)", () => {
  if (!runIntegration || !hasRealOpenAIKey) {
    it.skip("requires RUN_INTEGRATION=1 and a real OPENAI_API_KEY", () => {});
    return;
  }

  const endpoint = "https://api.openai.com/v1/responses";
  const apiKey = process.env.OPENAI_API_KEY!;

  it(
    "sends a simple request to OpenAI directly",
    { timeout: 60000 },
    async () => {
      const response = await callOpenResponses(endpoint, apiKey, {
        model: "gpt-4.1-mini", // OpenAI native model name (no prefix)
        input: "What is the capital of France? Answer in one word.",
      });

      expect(response.object).toBe("response");
      expect(response.status).toBe("completed");

      const message = response.output.find((o) => o.type === "message") as
        | Extract<OutputItem, { type: "message" }>
        | undefined;
      expect(message?.content[0]?.text?.toLowerCase()).toContain("paris");

      console.log(`OpenAI direct response:`, message?.content[0]?.text);
    }
  );
});
