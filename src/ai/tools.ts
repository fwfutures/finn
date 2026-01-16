import type { Tool as ClaudeTool } from "@anthropic-ai/sdk/resources/messages";
import { createModel, getAvailableModels, getModelByAlias, getModelByProviderId } from "./models";
import { updateUserModel } from "../services/users";
import { resetUserConversation } from "../services/conversations";
import { getOpenRouterModels, refreshOpenRouterModels, searchOpenRouterModels } from "./openrouter_models";
import type { Conversation } from "../services/conversations";
import type { User } from "../services/users";

export interface ToolContext {
  user: User;
  conversation: Conversation;
  onToolResult?: (event: {
    name: string;
    input: unknown;
    result: ToolResult;
  }) => void;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export interface OpenRouterToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: unknown, context: ToolContext) => Promise<ToolResult>;
}

export const TOOL_SYSTEM_PROMPT =
  "You can use tools to manage models and query OpenRouter's model catalog. " +
  "Use tools when a user asks to list or switch models, reset a conversation, " +
  "or find the most recent OpenRouter models by capability.";

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "list_models",
    description:
      "List available models Finn can use. Optionally filter by provider and include disabled models.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["claude", "openrouter", "all"],
          description: "Optional provider filter. Use 'all' for both.",
        },
        include_disabled: {
          type: "boolean",
          description: "Include disabled models in the response (default true).",
        },
      },
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const data = (input ?? {}) as {
        provider?: "claude" | "openrouter" | "all";
        include_disabled?: boolean;
      };
      const includeDisabled = data.include_disabled ?? true;
      const provider = data.provider ?? "all";

      const models = await getAvailableModels();
      const filtered = models.filter((model) => {
        if (provider !== "all" && model.provider !== provider) return false;
        if (!includeDisabled && !model.enabled) return false;
        return true;
      });

      return {
        content: JSON.stringify({
          current_model: context.user.preferredModel,
          models: filtered.map((model) => ({
            id: model.id,
            provider: model.provider,
            display_name: model.displayName,
            enabled: model.enabled,
          })),
        }),
      };
    },
  },
  {
    name: "switch_model",
    description:
      "Switch the current user's preferred model to a specific model id. Returns the new model info.",
    inputSchema: {
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "Model id to switch to (e.g. gpt-4o, claude-opus).",
        },
      },
      required: ["model"],
      additionalProperties: false,
    },
    handler: async (input, context) => {
      const data = (input ?? {}) as Record<string, unknown>;
      const modelId =
        (typeof input === "string" ? input : undefined) ||
        (typeof data.model === "string" ? data.model : undefined) ||
        (typeof data.model_id === "string" ? data.model_id : undefined) ||
        (typeof data.modelId === "string" ? data.modelId : undefined) ||
        (typeof data.model_name === "string" ? data.model_name : undefined) ||
        (typeof data.modelName === "string" ? data.modelName : undefined) ||
        (typeof data.id === "string" ? data.id : undefined) ||
        (typeof data.name === "string" ? data.name : undefined);
      const normalized = modelId?.trim();
      if (!normalized) {
        return { content: "Missing required 'model' field.", isError: true };
      }

      let model =
        (await getModelByAlias(normalized)) ?? (await getModelByProviderId(normalized));

      const models = await getAvailableModels();
      if (!model) {
        const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
        const normalizedValue = normalize(normalized);
        model =
          models.find((item) => normalize(item.id) === normalizedValue) ||
          models.find((item) => normalize(item.displayName) === normalizedValue) ||
          null;
      }

      if (!model) {
        const normalizedLower = normalized.toLowerCase();
        let openRouterModel = null;
        try {
          const { cache } = await getOpenRouterModels({
            refresh: false,
            maxAgeMs: Number.MAX_SAFE_INTEGER,
          });
          openRouterModel =
            cache.models.find((entry) => entry.id.toLowerCase() === normalizedLower) ||
            null;
        } catch {
          openRouterModel = null;
        }

        if (!openRouterModel) {
          try {
            const cache = await refreshOpenRouterModels();
            openRouterModel =
              cache.models.find((entry) => entry.id.toLowerCase() === normalizedLower) ||
              null;
          } catch {
            openRouterModel = null;
          }
        }

        if (openRouterModel) {
          const displayName =
            typeof openRouterModel.name === "string"
              ? openRouterModel.name
              : openRouterModel.id;
          model = await createModel({
            id: openRouterModel.id,
            provider: "openrouter",
            modelId: openRouterModel.id,
            displayName,
            enabled: true,
          });
        }
      }

      if (!model) {
        return {
          content: JSON.stringify({
            ok: false,
            error: `Model '${normalized}' not found`,
            available_models: models.map((m) => m.id),
          }),
          isError: true,
        };
      }

      if (!model.enabled) {
        return {
          content: JSON.stringify({
            ok: false,
            error: `Model '${model.displayName}' is disabled`,
          }),
          isError: true,
        };
      }

      await updateUserModel(context.user.id, model.id);
      context.user.preferredModel = model.id;

      return {
        content: JSON.stringify({
          ok: true,
          model: {
            id: model.id,
            display_name: model.displayName,
            provider: model.provider,
          },
        }),
      };
    },
  },
  {
    name: "reset_conversation",
    description: "Reset the user's conversation history, starting a fresh thread.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (_input, context) => {
      await resetUserConversation(context.user.id);
      return { content: JSON.stringify({ ok: true }) };
    },
  },
  {
    name: "openrouter_refresh_models",
    description:
      "Fetch the latest OpenRouter models from the OpenRouter API and refresh the local cache.",
    inputSchema: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "Force refresh even if cache is fresh (default true).",
        },
      },
      additionalProperties: false,
    },
    handler: async (input) => {
      const data = (input ?? {}) as { force?: boolean };
      const force = data.force ?? true;
      const cache = force ? await refreshOpenRouterModels() : (await getOpenRouterModels()).cache;
      return {
        content: JSON.stringify({
          ok: true,
          fetched_at: cache.fetchedAt,
          model_count: cache.models.length,
        }),
      };
    },
  },
  {
    name: "openrouter_search_models",
    description:
      "Search OpenRouter's model catalog to find recent models or models matching a query.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search text for model id/name/description (optional).",
        },
        limit: {
          type: "number",
          description: "Max number of results to return (default 5, max 25).",
        },
        sort: {
          type: "string",
          enum: ["recent", "relevance"],
          description:
            "Sort by 'recent' for newest models or 'relevance' for query match.",
        },
        refresh: {
          type: "boolean",
          description: "Refresh cache before searching (default false).",
        },
      },
      additionalProperties: false,
    },
    handler: async (input) => {
      const data = (input ?? {}) as {
        query?: string;
        limit?: number;
        sort?: "recent" | "relevance";
        refresh?: boolean;
      };

      const results = await searchOpenRouterModels({
        query: data.query,
        limit: data.limit,
        sort: data.sort,
        refresh: data.refresh,
      });

      return {
        content: JSON.stringify(results),
      };
    },
  },
];

const TOOL_BY_NAME = new Map(TOOL_DEFINITIONS.map((tool) => [tool.name, tool]));

export function getClaudeTools(): ClaudeTool[] {
  return TOOL_DEFINITIONS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

export function getOpenRouterTools(): OpenRouterToolDefinition[] {
  return TOOL_DEFINITIONS.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export async function executeTool(
  name: string,
  input: unknown,
  context: ToolContext
): Promise<ToolResult> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    return {
      content: JSON.stringify({ ok: false, error: `Unknown tool: ${name}` }),
      isError: true,
    };
  }

  try {
    const result = await tool.handler(input, context);
    context.onToolResult?.({ name, input, result });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      content: JSON.stringify({ ok: false, error: message }),
      isError: true,
    };
  }
}
