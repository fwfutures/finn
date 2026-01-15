import { config } from "../config";
import type { Message } from "../services/conversations";

export interface AIResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export async function generateOpenRouterResponse(
  modelId: string,
  messages: Message[],
  systemPrompt?: string
): Promise<AIResponse> {
  if (!config.openrouterApiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  const openRouterMessages = [
    {
      role: "system",
      content: systemPrompt || config.defaultSystemPrompt,
    },
    ...messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ];

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.publicUrl,
      "X-Title": "Finn Slack Bot",
    },
    body: JSON.stringify({
      model: modelId,
      messages: openRouterMessages,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${error}`);
  }

  const data = (await response.json()) as OpenRouterResponse;

  return {
    content: data.choices[0]?.message?.content || "",
    model: data.model,
    inputTokens: data.usage?.prompt_tokens || 0,
    outputTokens: data.usage?.completion_tokens || 0,
  };
}
