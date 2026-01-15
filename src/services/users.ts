import { db } from "../store";
import { config } from "../config";

export interface User {
  id: string;
  slackTeamId: string | null;
  slackUsername: string | null;
  displayName: string | null;
  email: string | null;
  role: "user" | "admin" | "super_admin";
  preferredModel: string;
  createdAt: number;
  updatedAt: number;
}

interface CreateUserParams {
  id: string;
  slackTeamId?: string;
  slackUsername?: string;
  displayName?: string;
  email?: string;
}

export async function getOrCreateUser(params: CreateUserParams): Promise<User> {
  const existing = db
    .prepare(
      `SELECT id, slack_team_id as slackTeamId, slack_username as slackUsername,
              display_name as displayName, email, role, preferred_model as preferredModel,
              created_at as createdAt, updated_at as updatedAt
       FROM users WHERE id = ?`
    )
    .get(params.id) as User | undefined;

  if (existing) {
    // Update with latest Slack info if changed
    if (
      params.slackUsername !== existing.slackUsername ||
      params.displayName !== existing.displayName ||
      params.email !== existing.email
    ) {
      db.prepare(
        `UPDATE users SET
           slack_username = COALESCE(?, slack_username),
           display_name = COALESCE(?, display_name),
           email = COALESCE(?, email),
           updated_at = unixepoch()
         WHERE id = ?`
      ).run(params.slackUsername, params.displayName, params.email, params.id);
    }
    return existing;
  }

  // Create new user
  db.prepare(
    `INSERT INTO users (id, slack_team_id, slack_username, display_name, email, preferred_model)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.slackTeamId || null,
    params.slackUsername || null,
    params.displayName || null,
    params.email || null,
    config.defaultModel
  );

  return db
    .prepare(
      `SELECT id, slack_team_id as slackTeamId, slack_username as slackUsername,
              display_name as displayName, email, role, preferred_model as preferredModel,
              created_at as createdAt, updated_at as updatedAt
       FROM users WHERE id = ?`
    )
    .get(params.id) as User;
}

export async function getUserById(id: string): Promise<User | null> {
  return (
    (db
      .prepare(
        `SELECT id, slack_team_id as slackTeamId, slack_username as slackUsername,
                display_name as displayName, email, role, preferred_model as preferredModel,
                created_at as createdAt, updated_at as updatedAt
         FROM users WHERE id = ?`
      )
      .get(id) as User | undefined) || null
  );
}

export async function updateUserModel(userId: string, modelId: string): Promise<void> {
  db.prepare(
    `UPDATE users SET preferred_model = ?, updated_at = unixepoch() WHERE id = ?`
  ).run(modelId, userId);
}

export async function updateUserRole(
  userId: string,
  role: "user" | "admin" | "super_admin"
): Promise<void> {
  db.prepare(`UPDATE users SET role = ?, updated_at = unixepoch() WHERE id = ?`).run(
    role,
    userId
  );
}

export async function getAllUsers(): Promise<User[]> {
  return db
    .prepare(
      `SELECT id, slack_team_id as slackTeamId, slack_username as slackUsername,
              display_name as displayName, email, role, preferred_model as preferredModel,
              created_at as createdAt, updated_at as updatedAt
       FROM users
       ORDER BY created_at DESC`
    )
    .all() as User[];
}

export async function getUserCount(): Promise<number> {
  const result = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
  return result.count;
}
