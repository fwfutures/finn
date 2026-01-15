import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { getSession } from "../../services/sessions";

export async function requireAuth(c: Context, next: Next) {
  const sessionId = getCookie(c, "finn_session");

  if (!sessionId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const session = await getSession(sessionId);

  if (!session) {
    return c.json({ error: "Session expired" }, 401);
  }

  // Attach session to context
  c.set("session", session);
  c.set("userEmail", session.email);

  await next();
}
