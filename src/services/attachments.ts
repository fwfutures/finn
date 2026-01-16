import type { WebClient } from "@slack/web-api";
import { config } from "../config";

export type AttachmentType = "image" | "text" | "document" | "other";

export interface Attachment {
  id: string;
  type: AttachmentType;
  mimeType: string;
  filename: string;
  // For images: base64 encoded data
  // For text files: the text content
  // For other files: description or null
  data: string | null;
}

interface SlackFile {
  id?: string;
  name?: string;
  mimetype?: string;
  filetype?: string;
  url_private_download?: string;
  url_private?: string;
}

// Image types that Claude and most vision models support
const SUPPORTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

// Text file types we can extract content from
const TEXT_FILE_TYPES = [
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/html",
  "text/xml",
  "application/json",
  "application/xml",
  "text/x-python",
  "text/x-javascript",
  "text/x-typescript",
  "application/javascript",
  "application/typescript",
];

function getAttachmentType(mimeType: string): AttachmentType {
  if (SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    return "image";
  }
  if (TEXT_FILE_TYPES.includes(mimeType) || mimeType.startsWith("text/")) {
    return "text";
  }
  if (mimeType === "application/pdf") {
    return "document";
  }
  return "other";
}

async function downloadFile(
  url: string,
  botToken: string
): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${botToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

export async function processSlackFiles(
  files: SlackFile[],
  client: WebClient
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];
  const botToken = config.slackBotToken;

  for (const file of files) {
    if (!file.id || !file.mimetype) {
      continue;
    }

    const mimeType = file.mimetype;
    const attachmentType = getAttachmentType(mimeType);
    const downloadUrl = file.url_private_download || file.url_private;

    if (!downloadUrl) {
      console.warn(`No download URL for file ${file.id}`);
      continue;
    }

    try {
      if (attachmentType === "image") {
        // Download and base64 encode image
        const buffer = await downloadFile(downloadUrl, botToken);
        const base64 = Buffer.from(buffer).toString("base64");

        attachments.push({
          id: file.id,
          type: "image",
          mimeType,
          filename: file.name || "image",
          data: base64,
        });
      } else if (attachmentType === "text") {
        // Download and read text content
        const buffer = await downloadFile(downloadUrl, botToken);
        const text = new TextDecoder().decode(buffer);

        // Limit text file size to avoid token explosion
        const maxChars = 50000;
        const truncatedText =
          text.length > maxChars
            ? text.slice(0, maxChars) + "\n... [truncated]"
            : text;

        attachments.push({
          id: file.id,
          type: "text",
          mimeType,
          filename: file.name || "file.txt",
          data: truncatedText,
        });
      } else {
        // For unsupported files, just note their presence
        attachments.push({
          id: file.id,
          type: attachmentType,
          mimeType,
          filename: file.name || "file",
          data: null,
        });
      }
    } catch (error) {
      console.error(`Error processing file ${file.id}:`, error);
      // Add a placeholder for failed files
      attachments.push({
        id: file.id,
        type: "other",
        mimeType,
        filename: file.name || "file",
        data: null,
      });
    }
  }

  return attachments;
}

// Serialize attachments for database storage
export function serializeAttachments(attachments: Attachment[]): string {
  return JSON.stringify(attachments);
}

// Deserialize attachments from database
export function deserializeAttachments(data: string | null): Attachment[] {
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}
