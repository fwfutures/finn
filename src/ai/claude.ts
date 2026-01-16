import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  ImageBlockParam,
  TextBlockParam,
  ToolResultBlockParam,
  ToolUseBlock,
  ToolChoice,
} from "@anthropic-ai/sdk/resources/messages";
import { config } from "../config";
import type { Message } from "../services/conversations";
import type { Attachment } from "../services/attachments";
import { executeTool, getClaudeTools, TOOL_SYSTEM_PROMPT, type ToolContext } from "./tools";

const client = new Anthropic({
  apiKey: config.anthropicApiKey,
});

export interface AIResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

// Convert attachments to Claude content blocks
function attachmentsToClaudeContent(
  text: string,
  attachments?: Attachment[]
): string | ContentBlockParam[] {
  if (!attachments || attachments.length === 0) {
    return text;
  }

  const contentBlocks: ContentBlockParam[] = [];

  // Add images first
  for (const attachment of attachments) {
    if (attachment.type === "image" && attachment.data) {
      // Map common mime types to Claude's expected format
      let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
      if (attachment.mimeType === "image/png") mediaType = "image/png";
      else if (attachment.mimeType === "image/gif") mediaType = "image/gif";
      else if (attachment.mimeType === "image/webp") mediaType = "image/webp";

      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: attachment.data,
        },
      } as ImageBlockParam);
    }
  }

  // Add text file contents as text blocks
  for (const attachment of attachments) {
    if (attachment.type === "text" && attachment.data) {
      contentBlocks.push({
        type: "text",
        text: `[File: ${attachment.filename}]\n${attachment.data}`,
      } as TextBlockParam);
    }
  }

  // Add the main message text
  if (text) {
    contentBlocks.push({
      type: "text",
      text: text,
    } as TextBlockParam);
  } else if (contentBlocks.length > 0) {
    // If no text but has attachments, add a minimal prompt
    contentBlocks.push({
      type: "text",
      text: "Please analyze the attached content.",
    } as TextBlockParam);
  }

  return contentBlocks;
}

export async function generateClaudeResponse(
  modelId: string,
  messages: Message[],
  systemPrompt?: string,
  toolContext?: ToolContext,
  options?: { toolChoice?: ToolChoice; client?: Anthropic }
): Promise<AIResponse> {
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: attachmentsToClaudeContent(m.content, m.attachments),
    }));

  const tools = toolContext ? getClaudeTools() : [];
  const system = [systemPrompt || config.defaultSystemPrompt, tools.length ? TOOL_SYSTEM_PROMPT : ""]
    .filter(Boolean)
    .join("\n\n");

  let inputTokens = 0;
  let outputTokens = 0;
  const apiClient = options?.client ?? client;
  let response = await apiClient.messages.create({
    model: modelId,
    max_tokens: 4096,
    system,
    messages: anthropicMessages,
    tools: tools.length ? tools : undefined,
    tool_choice: tools.length ? options?.toolChoice : undefined,
  });

  inputTokens += response.usage.input_tokens;
  outputTokens += response.usage.output_tokens;

  for (let step = 0; step < 3; step++) {
    const toolUses = response.content.filter((block) => block.type === "tool_use") as ToolUseBlock[];
    if (toolUses.length === 0 || !toolContext) {
      const textBlocks = response.content.filter(
        (block) => block.type === "text"
      ) as TextBlockParam[];
      const content = textBlocks.map((block) => block.text).join("");

      return {
        content,
        model: response.model,
        inputTokens,
        outputTokens,
      };
    }

    const toolResults: ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const result = await executeTool(toolUse.name, toolUse.input, toolContext);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: result.isError,
      });
    }

    anthropicMessages.push({
      role: "assistant",
      content: response.content,
    });
    anthropicMessages.push({
      role: "user",
      content: toolResults,
    });

    response = await apiClient.messages.create({
      model: modelId,
      max_tokens: 4096,
      system,
      messages: anthropicMessages,
      tools: tools.length ? tools : undefined,
      tool_choice: tools.length ? options?.toolChoice : undefined,
    });

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
  }

  const fallbackText = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block as TextBlockParam).text)
    .join("");

  return {
    content: fallbackText,
    model: response.model,
    inputTokens,
    outputTokens,
  };
}
