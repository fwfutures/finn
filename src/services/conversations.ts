import { db } from "../store";
import { nanoid } from "nanoid";
import {
  type Attachment,
  serializeAttachments,
  deserializeAttachments,
} from "./attachments";

export interface Conversation {
  id: string;
  userId: string;
  slackChannelId: string | null;
  slackThreadTs: string | null;
  model: string;
  status: "active" | "archived";
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[];
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  createdAt: number;
}

interface CreateConversationParams {
  userId: string;
  channelId: string;
  threadTs?: string;
  model: string;
}

interface AddMessageParams {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: Attachment[];
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}

export async function getOrCreateConversation(
  params: CreateConversationParams
): Promise<Conversation> {
  // For DMs (no thread), find existing active conversation
  // For threads, find by thread_ts
  const query = params.threadTs
    ? `SELECT * FROM conversations
       WHERE user_id = ? AND slack_channel_id = ? AND slack_thread_ts = ? AND status = 'active'`
    : `SELECT * FROM conversations
       WHERE user_id = ? AND slack_channel_id = ? AND slack_thread_ts IS NULL AND status = 'active'`;

  const queryParams = params.threadTs
    ? [params.userId, params.channelId, params.threadTs]
    : [params.userId, params.channelId];

  const existing = db.prepare(query).get(...queryParams) as
    | {
        id: string;
        user_id: string;
        slack_channel_id: string;
        slack_thread_ts: string;
        model: string;
        status: string;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (existing) {
    return {
      id: existing.id,
      userId: existing.user_id,
      slackChannelId: existing.slack_channel_id,
      slackThreadTs: existing.slack_thread_ts,
      model: existing.model,
      status: existing.status as "active" | "archived",
      createdAt: existing.created_at,
      updatedAt: existing.updated_at,
    };
  }

  // Create new conversation
  const id = nanoid();
  db.prepare(
    `INSERT INTO conversations (id, user_id, slack_channel_id, slack_thread_ts, model)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, params.userId, params.channelId, params.threadTs || null, params.model);

  return {
    id,
    userId: params.userId,
    slackChannelId: params.channelId,
    slackThreadTs: params.threadTs || null,
    model: params.model,
    status: "active",
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
  };
}

export async function addMessage(params: AddMessageParams): Promise<Message> {
  const id = nanoid();
  const now = Math.floor(Date.now() / 1000);
  const attachmentsJson = params.attachments
    ? serializeAttachments(params.attachments)
    : null;

  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, attachments, model, input_tokens, output_tokens, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.conversationId,
    params.role,
    params.content,
    attachmentsJson,
    params.model || null,
    params.inputTokens || null,
    params.outputTokens || null,
    params.latencyMs || null,
    now
  );

  // Update conversation timestamp
  db.prepare(`UPDATE conversations SET updated_at = unixepoch() WHERE id = ?`).run(
    params.conversationId
  );

  // Update daily usage if this is an assistant message with tokens
  if (params.role === "assistant" && (params.inputTokens || params.outputTokens)) {
    const conversation = await getConversationById(params.conversationId);
    if (conversation) {
      const today = new Date().toISOString().split("T")[0];
      db.prepare(
        `INSERT INTO usage_daily (date, user_id, model, message_count, input_tokens, output_tokens)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT (date, user_id, model) DO UPDATE SET
           message_count = message_count + 1,
           input_tokens = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens`
      ).run(
        today,
        conversation.userId,
        params.model || conversation.model,
        params.inputTokens || 0,
        params.outputTokens || 0
      );
    }
  }

  return {
    id,
    conversationId: params.conversationId,
    role: params.role,
    content: params.content,
    attachments: params.attachments,
    model: params.model || null,
    inputTokens: params.inputTokens || null,
    outputTokens: params.outputTokens || null,
    latencyMs: params.latencyMs || null,
    createdAt: now,
  };
}

export async function getConversationMessages(conversationId: string): Promise<Message[]> {
  const rows = db
    .prepare(
      `SELECT id, conversation_id as conversationId, role, content, attachments,
              model, input_tokens as inputTokens, output_tokens as outputTokens,
              latency_ms as latencyMs, created_at as createdAt
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at ASC`
    )
    .all(conversationId) as Array<{
    id: string;
    conversationId: string;
    role: "user" | "assistant" | "system";
    content: string;
    attachments: string | null;
    model: string | null;
    inputTokens: number | null;
    outputTokens: number | null;
    latencyMs: number | null;
    createdAt: number;
  }>;

  return rows.map((row) => ({
    ...row,
    attachments: deserializeAttachments(row.attachments),
  }));
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  const row = db
    .prepare(
      `SELECT id, user_id as userId, slack_channel_id as slackChannelId,
              slack_thread_ts as slackThreadTs, model, status,
              created_at as createdAt, updated_at as updatedAt
       FROM conversations WHERE id = ?`
    )
    .get(id) as Conversation | undefined;

  return row || null;
}

export async function resetUserConversation(userId: string): Promise<void> {
  // Archive all active conversations for this user
  db.prepare(
    `UPDATE conversations SET status = 'archived', updated_at = unixepoch()
     WHERE user_id = ? AND status = 'active'`
  ).run(userId);
}

export async function getAllConversations(
  options: { limit?: number; offset?: number; userId?: string } = {}
): Promise<Conversation[]> {
  const { limit = 50, offset = 0, userId } = options;

  let query = `
    SELECT id, user_id as userId, slack_channel_id as slackChannelId,
           slack_thread_ts as slackThreadTs, model, status,
           created_at as createdAt, updated_at as updatedAt
    FROM conversations
  `;
  const params: unknown[] = [];

  if (userId) {
    query += " WHERE user_id = ?";
    params.push(userId);
  }

  query += " ORDER BY updated_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  return db.prepare(query).all(...params) as Conversation[];
}

export async function getConversationCount(): Promise<number> {
  const result = db.prepare("SELECT COUNT(*) as count FROM conversations").get() as {
    count: number;
  };
  return result.count;
}

export async function getMessageCount(): Promise<number> {
  const result = db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
  return result.count;
}
