import { config } from "../config";
import type { Message } from "../services/conversations";
import type { Attachment } from "../services/attachments";
import { executeTool, getOpenRouterTools, TOOL_SYSTEM_PROMPT, type ToolContext } from "./tools";

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
      content?: string | null;
      tool_calls?: OpenRouterToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenRouterToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
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
  systemPrompt?: string,
  toolContext?: ToolContext,
  options?: { toolChoice?: unknown }
): Promise<AIResponse> {
  if (!config.openrouterApiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  const tools = toolContext ? getOpenRouterTools() : [];
  const system = [systemPrompt || config.defaultSystemPrompt, tools.length ? TOOL_SYSTEM_PROMPT : ""]
    .filter(Boolean)
    .join("\n\n");

  const openRouterMessages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: system,
    },
    ...messages.map((m) => ({
      role: m.role,
      content: attachmentsToOpenRouterContent(m.content, m.attachments),
    })),
  ];

  let inputTokens = 0;
  let outputTokens = 0;

  for (let step = 0; step < 3; step++) {
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
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? (options?.toolChoice ?? "auto") : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} ${error}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    const choice = data.choices[0];
    const message = choice?.message;
    const toolCalls = message?.tool_calls ?? [];

    inputTokens += data.usage?.prompt_tokens || 0;
    outputTokens += data.usage?.completion_tokens || 0;

    if (!toolCalls.length || !toolContext) {
      return {
        content: message?.content || "",
        model: data.model,
        inputTokens,
        outputTokens,
      };
    }

    openRouterMessages.push({
      role: "assistant",
      content: message?.content ?? null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      let parsedArgs: unknown = {};
      try {
        parsedArgs = call.function.arguments
          ? (JSON.parse(call.function.arguments) as unknown)
          : {};
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid JSON arguments";
        openRouterMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ ok: false, error: message }),
        });
        continue;
      }

      const result = await executeTool(call.function.name, parsedArgs, toolContext);
      openRouterMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result.content,
      });
    }
  }

  return {
    content: "Sorry, I ran into a tool loop while responding.",
    model: modelId,
    inputTokens,
    outputTokens,
  };
}
