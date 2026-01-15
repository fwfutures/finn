const API_BASE = "/api";
const AUTH_BASE = "/auth";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.location.href = "/admin/login";
      throw new Error("Unauthorized");
    }
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// Auth
export async function checkAuth(): Promise<{ authenticated: boolean; email?: string }> {
  const response = await fetch(`${AUTH_BASE}/me`, { credentials: "include" });
  return response.json();
}

export async function logout(): Promise<void> {
  await fetch(`${AUTH_BASE}/logout`, { method: "POST", credentials: "include" });
  window.location.href = "/admin/login";
}

// Stats
export interface Stats {
  totals: { users: number; conversations: number; messages: number };
  today: { messages: number; tokens: number };
  recentActivity: Array<{
    id: string;
    userId: string;
    userName: string;
    model: string;
    updatedAt: number;
    messageCount: number;
  }>;
}

export function getStats(): Promise<Stats> {
  return request<Stats>("/stats");
}

// Users
export interface User {
  id: string;
  slackTeamId: string | null;
  slackUsername: string | null;
  displayName: string | null;
  email: string | null;
  role: string;
  preferredModel: string;
  createdAt: number;
  updatedAt: number;
}

export function getUsers(): Promise<{ users: User[] }> {
  return request<{ users: User[] }>("/users");
}

export function getUser(id: string): Promise<{ user: User; conversations: Conversation[] }> {
  return request<{ user: User; conversations: Conversation[] }>(`/users/${id}`);
}

export function updateUserRole(id: string, role: string): Promise<{ user: User }> {
  return request<{ user: User }>(`/users/${id}/role`, {
    method: "POST",
    body: JSON.stringify({ role }),
  });
}

// Conversations
export interface Conversation {
  id: string;
  userId: string;
  slackChannelId: string | null;
  slackThreadTs: string | null;
  model: string;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  createdAt: number;
}

export function getConversations(params?: {
  limit?: number;
  offset?: number;
  userId?: string;
}): Promise<{ conversations: Conversation[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  if (params?.userId) searchParams.set("userId", params.userId);
  const query = searchParams.toString();
  return request<{ conversations: Conversation[]; total: number }>(
    `/conversations${query ? `?${query}` : ""}`
  );
}

export function getConversation(
  id: string
): Promise<{ conversation: Conversation; messages: Message[]; user: User }> {
  return request<{ conversation: Conversation; messages: Message[]; user: User }>(
    `/conversations/${id}`
  );
}

// Models
export interface Model {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
}

export function getModels(): Promise<{ models: Model[] }> {
  return request<{ models: Model[] }>("/models");
}

export function updateModel(
  id: string,
  updates: { displayName?: string; enabled?: boolean }
): Promise<{ model: Model }> {
  return request<{ model: Model }>(`/models/${id}`, {
    method: "POST",
    body: JSON.stringify(updates),
  });
}

// Usage
export interface UsageData {
  dailyUsage: Array<{ date: string; messages: number; inputTokens: number; outputTokens: number }>;
  modelUsage: Array<{ model: string; messages: number; inputTokens: number; outputTokens: number }>;
  topUsers: Array<{
    id: string;
    displayName: string;
    slackUsername: string;
    messages: number;
    totalTokens: number;
  }>;
  period: { days: number; startDate: string };
}

export function getUsage(days: number = 30): Promise<UsageData> {
  return request<UsageData>(`/usage?days=${days}`);
}
