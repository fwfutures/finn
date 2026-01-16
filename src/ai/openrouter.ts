import { config } from "../config";
import type { Message } from "../services/conversations";
import type { Attachment } from "../services/attachments";

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

// OpenAI-compatible content format
type OpenRouterContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

// Convert attachments to OpenRouter/OpenAI format
function attachmentsToOpenRouterContent(
  text: string,
  attachments?: Attachment[]
): OpenRouterContent {
  if (!attachments || attachments.length === 0) {
    return text;
  }

  const contentParts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];

  // Add images as data URLs
  for (const attachment of attachments) {
    if (attachment.type === "image" && attachment.data) {
      contentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${attachment.mimeType};base64,${attachment.data}`,
        },
      });
    }
  }

  // Add text file contents
  for (const attachment of attachments) {
    if (attachment.type === "text" && attachment.data) {
      contentParts.push({
        type: "text",
        text: `[File: ${attachment.filename}]\n${attachment.data}`,
      });
    }
  }

  // Add the main message text
  if (text) {
    contentParts.push({
      type: "text",
      text: text,
    });
  } else if (contentParts.length > 0) {
    // If no text but has attachments, add a minimal prompt
    contentParts.push({
      type: "text",
      text: "Please analyze the attached content.",
    });
  }

  return contentParts;
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
      content: attachmentsToOpenRouterContent(m.content, m.attachments),
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
