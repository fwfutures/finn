import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { config } from "../config";
import type { Message } from "../services/conversations";
import type { Attachment } from "../services/attachments";

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
  systemPrompt?: string
): Promise<AIResponse> {
  const anthropicMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: attachmentsToClaudeContent(m.content, m.attachments),
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
