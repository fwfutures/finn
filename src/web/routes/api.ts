import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { getAllUsers, getUserById, updateUserRole, getUserCount } from "../../services/users";
import {
  getAllConversations,
  getConversationById,
  getConversationMessages,
  getConversationCount,
  getMessageCount,
} from "../../services/conversations";
import { getAvailableModels, getModelById, updateModel } from "../../ai/models";
import { db } from "../../store";

const api = new Hono();

// Apply auth middleware to all routes
api.use("*", requireAuth);

// ========== Users ==========

api.get("/users", async (c) => {
  const users = await getAllUsers();
  return c.json({ users });
});

api.get("/users/:id", async (c) => {
  const id = c.req.param("id");
  const user = await getUserById(id);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Get user's conversations
  const conversations = await getAllConversations({ userId: id, limit: 20 });

  return c.json({ user, conversations });
});

api.post("/users/:id/role", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ role: string }>();

  if (!["user", "admin", "super_admin"].includes(body.role)) {
    return c.json({ error: "Invalid role" }, 400);
  }

  await updateUserRole(id, body.role as "user" | "admin" | "super_admin");
  const user = await getUserById(id);

  return c.json({ user });
});

// ========== Conversations ==========

api.get("/conversations", async (c) => {
  const limit = parseInt(c.req.query("limit") || "50");
  const offset = parseInt(c.req.query("offset") || "0");
  const userId = c.req.query("userId");

  const conversations = await getAllConversations({ limit, offset, userId: userId || undefined });
  const total = await getConversationCount();

  return c.json({ conversations, total, limit, offset });
});

api.get("/conversations/:id", async (c) => {
  const id = c.req.param("id");
  const conversation = await getConversationById(id);

  if (!conversation) {
    return c.json({ error: "Conversation not found" }, 404);
  }

  const messages = await getConversationMessages(id);
  const user = await getUserById(conversation.userId);

  return c.json({ conversation, messages, user });
});

// ========== Models ==========

api.get("/models", async (c) => {
  const models = await getAvailableModels();
  return c.json({ models });
});

api.post("/models/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ displayName?: string; enabled?: boolean }>();

  const model = await getModelById(id);
  if (!model) {
    return c.json({ error: "Model not found" }, 404);
  }

  await updateModel(id, body);
  const updated = await getModelById(id);

  return c.json({ model: updated });
});

// ========== Usage ==========

api.get("/usage", async (c) => {
  const days = parseInt(c.req.query("days") || "30");
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split("T")[0];

  // Daily usage
  const dailyUsage = db
    .prepare(
      `SELECT date, SUM(message_count) as messages, SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens
       FROM usage_daily
       WHERE date >= ?
       GROUP BY date
       ORDER BY date ASC`
    )
    .all(startDateStr) as Array<{
    date: string;
    messages: number;
    inputTokens: number;
    outputTokens: number;
  }>;

  // Usage by model
  const modelUsage = db
    .prepare(
      `SELECT model, SUM(message_count) as messages, SUM(input_tokens) as inputTokens, SUM(output_tokens) as outputTokens
       FROM usage_daily
       WHERE date >= ?
       GROUP BY model
       ORDER BY messages DESC`
    )
    .all(startDateStr) as Array<{
    model: string;
    messages: number;
    inputTokens: number;
    outputTokens: number;
  }>;

  // Top users
  const topUsers = db
    .prepare(
      `SELECT u.id, u.display_name as displayName, u.slack_username as slackUsername,
              SUM(ud.message_count) as messages, SUM(ud.input_tokens + ud.output_tokens) as totalTokens
       FROM usage_daily ud
       JOIN users u ON ud.user_id = u.id
       WHERE ud.date >= ?
       GROUP BY ud.user_id
       ORDER BY messages DESC
       LIMIT 10`
    )
    .all(startDateStr) as Array<{
    id: string;
    displayName: string;
    slackUsername: string;
    messages: number;
    totalTokens: number;
  }>;

  return c.json({
    dailyUsage,
    modelUsage,
    topUsers,
    period: { days, startDate: startDateStr },
  });
});

api.get("/usage/export", async (c) => {
  const format = c.req.query("format") || "json";
  const days = parseInt(c.req.query("days") || "30");
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split("T")[0];

  const data = db
    .prepare(
      `SELECT date, user_id as userId, model, message_count as messages, input_tokens as inputTokens, output_tokens as outputTokens
       FROM usage_daily
       WHERE date >= ?
       ORDER BY date DESC`
    )
    .all(startDateStr);

  if (format === "csv") {
    const csv = [
      "date,user_id,model,messages,input_tokens,output_tokens",
      ...data.map(
        (row: any) =>
          `${row.date},${row.userId},${row.model},${row.messages},${row.inputTokens},${row.outputTokens}`
      ),
    ].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="finn-usage-${startDateStr}.csv"`,
      },
    });
  }

  return c.json({ data });
});

// ========== Dashboard Stats ==========

api.get("/stats", async (c) => {
  const userCount = await getUserCount();
  const conversationCount = await getConversationCount();
  const messageCount = await getMessageCount();

  // Today's stats
  const today = new Date().toISOString().split("T")[0];
  const todayStats = db
    .prepare(
      `SELECT SUM(message_count) as messages, SUM(input_tokens + output_tokens) as tokens
       FROM usage_daily WHERE date = ?`
    )
    .get(today) as { messages: number | null; tokens: number | null };

  // Recent activity
  const recentConversations = db
    .prepare(
      `SELECT c.id, c.user_id as userId, u.display_name as userName, c.model, c.updated_at as updatedAt,
              (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as messageCount
       FROM conversations c
       JOIN users u ON c.user_id = u.id
       ORDER BY c.updated_at DESC
       LIMIT 10`
    )
    .all() as Array<{
    id: string;
    userId: string;
    userName: string;
    model: string;
    updatedAt: number;
    messageCount: number;
  }>;

  return c.json({
    totals: {
      users: userCount,
      conversations: conversationCount,
      messages: messageCount,
    },
    today: {
      messages: todayStats.messages || 0,
      tokens: todayStats.tokens || 0,
    },
    recentActivity: recentConversations,
  });
});

export default api;
