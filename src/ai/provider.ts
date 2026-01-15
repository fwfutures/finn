import { getModelById } from "./models";
import { generateClaudeResponse } from "./claude";
import { generateOpenRouterResponse } from "./openrouter";
import { getConversationMessages } from "../services/conversations";
import { config } from "../config";

export interface AIResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateResponse(
  conversationId: string,
  modelAlias: string
): Promise<AIResponse> {
  // Get model configuration
  const model = await getModelById(modelAlias);
  if (!model) {
    throw new Error(`Model "${modelAlias}" not found`);
  }

  if (!model.enabled) {
    throw new Error(`Model "${model.displayName}" is disabled`);
  }

  // Get conversation history
  const messages = await getConversationMessages(conversationId);

  // Route to appropriate provider
  switch (model.provider) {
    case "claude":
      return generateClaudeResponse(model.modelId, messages, config.defaultSystemPrompt);
    case "openrouter":
      return generateOpenRouterResponse(model.modelId, messages, config.defaultSystemPrompt);
    default:
      throw new Error(`Unknown provider: ${model.provider}`);
  }
}
