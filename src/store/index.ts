import { Database } from "bun:sqlite";
import { config } from "../config";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";

// Ensure data directory exists
const dbDir = dirname(config.databasePath);
if (!existsSync(dbDir)) {
  mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(config.databasePath);

// Enable WAL mode for better concurrent performance
db.exec("PRAGMA journal_mode = WAL");

// Initialize schema
export function initializeDatabase() {
  db.exec(`
    -- Users (from Slack)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      slack_team_id TEXT,
      slack_username TEXT,
      display_name TEXT,
      email TEXT,
      role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'super_admin')),
      preferred_model TEXT DEFAULT 'claude-opus',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Conversations
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      slack_channel_id TEXT,
      slack_thread_ts TEXT,
      model TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Messages
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      latency_ms INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    -- Model configuration
    CREATE TABLE IF NOT EXISTS model_config (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('claude', 'openrouter')),
      model_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    -- Admin sessions
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      expires_at INTEGER NOT NULL
    );

    -- Daily usage aggregates
    CREATE TABLE IF NOT EXISTS usage_daily (
      date TEXT NOT NULL,
      user_id TEXT NOT NULL,
      model TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      PRIMARY KEY (date, user_id, model),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_usage_daily_date ON usage_daily(date);
    CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);
  `);

  // Seed default models if not exist
  const existingModels = db.prepare("SELECT COUNT(*) as count FROM model_config").get() as { count: number };

  if (existingModels.count === 0) {
    const insertModel = db.prepare(`
      INSERT INTO model_config (id, provider, model_id, display_name, enabled)
      VALUES (?, ?, ?, ?, ?)
    `);

    const defaultModels = [
      // Claude models
      ["claude-opus", "claude", "claude-opus-4-20250514", "Claude Opus 4", 1],
      ["claude-sonnet", "claude", "claude-sonnet-4-20250514", "Claude Sonnet 4", 1],
      // OpenRouter models
      ["gpt-4", "openrouter", "openai/gpt-4-turbo", "GPT-4 Turbo", 1],
      ["gpt-4o", "openrouter", "openai/gpt-4o", "GPT-4o", 1],
      ["gemini-pro", "openrouter", "google/gemini-pro-1.5", "Gemini Pro 1.5", 1],
      ["llama-3", "openrouter", "meta-llama/llama-3.1-70b-instruct", "Llama 3.1 70B", 1],
    ];

    for (const model of defaultModels) {
      insertModel.run(...model);
    }
  }

  console.log("Database initialized successfully");
}

// Cleanup function
export function closeDatabase() {
  db.close();
}
