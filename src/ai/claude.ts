import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import type { Message } from "../services/conversations";

const client = new Anthropic({
  apiKey: config.anthropicApiKey,
});

export interface AIResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export async function generateClaudeResponse(
  modelId: string,
  messages: Message[],
  systemPrompt?: string
): Promise<AIResponse> {
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 4096,
    system: systemPrompt || config.defaultSystemPrompt,
    messages: anthropicMessages,
  });

  const textContent = response.content.find((c) => c.type === "text");
  const content = textContent?.type === "text" ? textContent.text : "";

  return {
    content,
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
