import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const tmpDir = mkdtempSync("/tmp/finn-test-");

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
      (value.startsWith("\"") && value.endsWith("\"")) ||
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
  process.env.RUN_INTEGRATION !== undefined ? process.env.RUN_INTEGRATION === "1" : true;
const hasRealOpenRouterKey =
  !!process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== "sk-or-test";
const hasRealAnthropicKey =
  !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "sk-ant-test";
const openRouterToolModel = process.env.OPENROUTER_TOOL_MODEL || "openai/gpt-5.2";
const openRouterSwitchModel = process.env.OPENROUTER_SWITCH_MODEL || "kimi-k2";
const openRouterSwitchModelId =
  process.env.OPENROUTER_SWITCH_MODEL_ID || "moonshotai/kimi-k2";
const anthropicToolModel =
  process.env.ANTHROPIC_TOOL_MODEL || "claude-sonnet-4-5-20250514";
const anthropicToolModelAlias =
  process.env.ANTHROPIC_TOOL_MODEL_ALIAS || "claude-sonnet";
const openRouterSwitchDisplayName =
  process.env.OPENROUTER_SWITCH_DISPLAY_NAME || "Kimi K2";

let closeDatabase: (() => void) | undefined;

async function ensureModelAlias(params: {
  id: string;
  provider: "claude" | "openrouter";
  modelId: string;
  displayName: string;
}) {
  const { db } = await import("../../store");
  const existing = db
    .prepare("SELECT id FROM model_config WHERE id = ?")
    .get(params.id) as { id: string } | undefined;
  if (existing) return;
  db.prepare(
    `INSERT INTO model_config (id, provider, model_id, display_name, enabled)
     VALUES (?, ?, ?, ?, 1)`
  ).run(params.id, params.provider, params.modelId, params.displayName);
}

beforeAll(async () => {
  const store = await import("../../store");
  store.initializeDatabase();
  closeDatabase = store.closeDatabase;
});

afterAll(() => {
  closeDatabase?.();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("OpenRouter model cache", () => {
  it("refreshes and searches cached models", async () => {
    const { refreshOpenRouterModels, searchOpenRouterModels } = await import(
      "../openrouter_models"
    );

    const models = [
      {
        id: "openai/gpt-4o-mini",
        name: "GPT-4o mini",
        description: "fast vision model",
        created: 1000,
        context_length: 128000,
      },
      {
        id: "anthropic/claude-3",
        name: "Claude 3",
        description: "strong reasoning model",
        created: 2000,
        context_length: 200000,
      },
      {
        id: "google/gemini",
        name: "Gemini",
        description: "multimodal model",
        created: 1500,
        context_length: 100000,
      },
    ];

    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ data: models }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const cache = await refreshOpenRouterModels();
      expect(cache.models.length).toBe(3);
      expect(fetchCalls).toBe(1);

      const results = await searchOpenRouterModels({ sort: "recent", limit: 2 });
      expect(results.source).toBe("cache");
      expect(results.results[0].id).toBe("anthropic/claude-3");
      expect(results.results[1].id).toBe("google/gemini");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("Tool calling across providers", () => {
  it("executes OpenRouter tool calls and returns final content", async () => {
    const { generateOpenRouterResponse } = await import("../openrouter");
    const { getOrCreateUser } = await import("../../services/users");
    const { getOrCreateConversation } = await import("../../services/conversations");

    const cachePath = join(tmpDir, "openrouter-models.json");
    writeFileSync(
      cachePath,
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        models: [
          {
            id: "openai/gpt-4o-mini",
            name: "GPT-4o mini",
            description: "vision model",
            created: 2000,
            context_length: 128000,
          },
          {
            id: "openai/gpt-4o",
            name: "GPT-4o",
            description: "vision model",
            created: 1500,
            context_length: 128000,
          },
        ],
      })
    );

    const user = await getOrCreateUser({ id: "U_OPENROUTER_TEST" });
    const conversation = await getOrCreateConversation({
      userId: user.id,
      channelId: "C_OPENROUTER_TEST",
      model: user.preferredModel,
    });

    const originalFetch = globalThis.fetch;
    const requests: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    globalThis.fetch = async (input, init) => {
      const body = init?.body ? JSON.parse(init.body.toString()) : null;
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
            ? input.url
            : String(input);
      requests.push({ url, body });

      if (requests.length === 1) {
        return new Response(
          JSON.stringify({
            id: "resp_1",
            model: "openrouter/test",
            choices: [
              {
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "openrouter_search_models",
                        arguments: JSON.stringify({
                          query: "vision",
                          limit: 2,
                          sort: "recent",
                        }),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          id: "resp_2",
          model: "openrouter/test",
          choices: [
            {
              message: {
                role: "assistant",
                content: "Here are the models you asked for.",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 8,
            completion_tokens: 6,
            total_tokens: 14,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    try {
      const response = await generateOpenRouterResponse(
        "openrouter/test",
        [
          {
            id: "msg-1",
            conversationId: conversation.id,
            role: "user",
            content: "Find recent vision models",
            attachments: undefined,
            model: null,
            inputTokens: null,
            outputTokens: null,
            latencyMs: null,
            createdAt: Date.now(),
          },
        ],
        "system prompt",
        { user, conversation }
      );

      expect(response.content).toBe("Here are the models you asked for.");
      expect(requests.length).toBe(2);
      expect(requests[0]?.body?.tools).toBeDefined();

      const toolMessage = requests[1]?.body?.messages?.find(
        (msg: Record<string, unknown>) => msg.role === "tool"
      ) as Record<string, unknown> | undefined;
      expect(toolMessage).toBeDefined();
      if (toolMessage && typeof toolMessage.content === "string") {
        const toolPayload = JSON.parse(toolMessage.content) as { results?: Array<{ id: string }> };
        expect(toolPayload.results?.[0]?.id).toBe("openai/gpt-4o-mini");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("executes Claude tool calls and returns final content", async () => {
    const { getOrCreateUser } = await import("../../services/users");
    const { getOrCreateConversation } = await import("../../services/conversations");

    const user = await getOrCreateUser({ id: "U_CLAUDE_TEST" });
    const conversation = await getOrCreateConversation({
      userId: user.id,
      channelId: "C_CLAUDE_TEST",
      model: user.preferredModel,
    });

    const requests: Array<Record<string, unknown>> = [];
    let callCount = 0;
    const mockClient = {
      messages: {
        create: async (params: Record<string, unknown>) => {
          requests.push(params);
          callCount += 1;
          if (callCount === 1) {
            return {
              id: "msg_1",
              type: "message",
              role: "assistant",
              model: "claude-test",
              content: [
                {
                  type: "tool_use",
                  id: "toolu_1",
                  name: "list_models",
                  input: { provider: "all" },
                },
              ],
              stop_reason: "tool_use",
              usage: { input_tokens: 10, output_tokens: 5 },
            };
          }

          return {
            id: "msg_2",
            type: "message",
            role: "assistant",
            model: "claude-test",
            content: [{ type: "text", text: "Done." }],
            stop_reason: "end_turn",
            usage: { input_tokens: 12, output_tokens: 6 },
          };
        },
      },
    };

    const { generateClaudeResponse } = await import("../claude?unit");
    const response = await generateClaudeResponse(
      "claude-test",
      [
        {
          id: "msg-1",
          conversationId: conversation.id,
          role: "user",
          content: "List models",
          attachments: undefined,
          model: null,
          inputTokens: null,
          outputTokens: null,
          latencyMs: null,
          createdAt: Date.now(),
        },
      ],
      "system prompt",
      { user, conversation },
      { client: mockClient as never }
    );

    expect(response.content).toBe("Done.");
    expect(response.inputTokens).toBe(22);
    expect(response.outputTokens).toBe(11);
    expect(requests.length).toBe(2);
    expect(requests[0]?.tools).toBeDefined();

    const toolResultMessage = (requests[1]?.messages as Array<Record<string, unknown>> | undefined)
      ?.find(
        (msg: Record<string, unknown>) =>
          msg.role === "user" &&
          Array.isArray(msg.content) &&
          msg.content.some((block: Record<string, unknown>) => block.type === "tool_result")
      );
    expect(toolResultMessage).toBeDefined();
  });
});

describe("Integration (OpenRouter)", () => {
  if (!runIntegration || !hasRealOpenRouterKey) {
    it.skip("requires RUN_INTEGRATION=1 and a real OPENROUTER_API_KEY", () => {});
    return;
  }

  it(
    "fetches OpenRouter models endpoint",
    { timeout: 60000 },
    async () => {
      const { refreshOpenRouterModels } = await import("../openrouter_models");
      const cache = await refreshOpenRouterModels();
      expect(cache.models.length).toBeGreaterThan(0);
    }
  );

  if (!openRouterToolModel) {
    it.skip("requires OPENROUTER_TOOL_MODEL to run tool calling integration", () => {});
    return;
  }

  it(
    "executes tool calling via OpenRouter provider",
    { timeout: 60000 },
    async () => {
      const { generateOpenRouterResponse } = await import("../openrouter");
      const { getOrCreateUser, updateUserModel, getUserById } = await import(
        "../../services/users"
      );
      const { getOrCreateConversation } = await import("../../services/conversations");

      const targetModel = openRouterSwitchModel;
      await ensureModelAlias({
        id: targetModel,
        provider: "openrouter",
        modelId: openRouterSwitchModelId,
        displayName: openRouterSwitchDisplayName,
      });

      const user = await getOrCreateUser({ id: "U_OPENROUTER_INTEGRATION" });
      await updateUserModel(user.id, "claude-opus");

      const conversation = await getOrCreateConversation({
        userId: user.id,
        channelId: "C_OPENROUTER_INTEGRATION",
        model: user.preferredModel,
      });

      const response = await generateOpenRouterResponse(
        openRouterToolModel,
        [
          {
            id: "msg-openrouter-1",
            conversationId: conversation.id,
            role: "user",
            content:
              `You must call the switch_model tool with model "${targetModel}" ` +
              "and then reply with exactly 'switched'.",
            attachments: undefined,
            model: null,
            inputTokens: null,
            outputTokens: null,
            latencyMs: null,
            createdAt: Date.now(),
          },
        ],
        "You must call switch_model before responding.",
        { user, conversation },
        { toolChoice: { type: "function", function: { name: "switch_model" } } }
      );

      const updated = await getUserById(user.id);
      expect(updated?.preferredModel).toBe(targetModel);
      expect(response.content.length).toBeGreaterThan(0);
    }
  );
});

describe("Integration (Claude)", () => {
  if (!runIntegration || !hasRealAnthropicKey) {
    it.skip("requires RUN_INTEGRATION=1 and a real ANTHROPIC_API_KEY", () => {});
    return;
  }

  if (!anthropicToolModel) {
    it.skip("requires ANTHROPIC_TOOL_MODEL to run tool calling integration", () => {});
    return;
  }

  it(
    "executes tool calling via Claude provider",
    { timeout: 60000 },
    async () => {
      const { generateClaudeResponse } = await import("../claude");
      const { getOrCreateUser, updateUserModel, getUserById } = await import(
        "../../services/users"
      );
      const { getOrCreateConversation } = await import("../../services/conversations");
      const { getModelByAlias } = await import("../models");

      const targetModel = openRouterSwitchModel;
      await ensureModelAlias({
        id: targetModel,
        provider: "openrouter",
        modelId: openRouterSwitchModelId,
        displayName: openRouterSwitchDisplayName,
      });

      const resolvedModel =
        (await getModelByAlias(anthropicToolModelAlias))?.modelId || anthropicToolModel;

      const user = await getOrCreateUser({ id: "U_CLAUDE_INTEGRATION" });
      await updateUserModel(user.id, "claude-opus");

      const conversation = await getOrCreateConversation({
        userId: user.id,
        channelId: "C_CLAUDE_INTEGRATION",
        model: user.preferredModel,
      });

      let toolCalled = false;
      let toolError: string | null = null;

      const response = await generateClaudeResponse(
        resolvedModel,
        [
          {
            id: "msg-claude-1",
            conversationId: conversation.id,
            role: "user",
            content:
              `You must call the switch_model tool with model "${targetModel}" ` +
              "and then reply with exactly 'switched'.",
            attachments: undefined,
            model: null,
            inputTokens: null,
            outputTokens: null,
            latencyMs: null,
            createdAt: Date.now(),
          },
        ],
        "You must call switch_model before responding.",
        {
          user,
          conversation,
          onToolResult: (event) => {
            if (event.name === "switch_model") {
              toolCalled = true;
              if (event.result.isError) {
                toolError = event.result.content;
              }
            }
          },
        },
        { toolChoice: { type: "tool", name: "switch_model" } }
      );

      if (!toolCalled) {
        throw new Error(
          `Claude did not call switch_model. model=${response.model} resolved=${resolvedModel} response=${response.content}`
        );
      }

      if (toolError) {
        throw new Error(`switch_model failed: ${toolError}`);
      }

      const updated = await getUserById(user.id);
      expect(updated?.preferredModel).toBe(targetModel);
      expect(response.content.length).toBeGreaterThanOrEqual(0);
    }
  );
});
