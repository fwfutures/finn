import { db } from "../store";
import { nanoid } from "nanoid";

const SESSION_DURATION_HOURS = 24 * 7; // 7 days

export interface AdminSession {
  id: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}

export async function createSession(email: string): Promise<AdminSession> {
  const id = nanoid(32);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_DURATION_HOURS * 60 * 60;

  db.prepare(
    `INSERT INTO admin_sessions (id, email, created_at, expires_at)
     VALUES (?, ?, ?, ?)`
  ).run(id, email, now, expiresAt);

  return { id, email, createdAt: now, expiresAt };
}

export async function getSession(id: string): Promise<AdminSession | null> {
  const now = Math.floor(Date.now() / 1000);

  const row = db
    .prepare(
      `SELECT id, email, created_at as createdAt, expires_at as expiresAt
       FROM admin_sessions
       WHERE id = ? AND expires_at > ?`
    )
    .get(id, now) as AdminSession | undefined;

  return row || null;
}

export async function deleteSession(id: string): Promise<void> {
  db.prepare("DELETE FROM admin_sessions WHERE id = ?").run(id);
}

export async function cleanupExpiredSessions(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  db.prepare("DELETE FROM admin_sessions WHERE expires_at < ?").run(now);
}
