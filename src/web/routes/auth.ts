import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { nanoid } from "nanoid";
import { getAuthUrl, exchangeCodeForTokens, getUserInfo, isAllowedEmail } from "../../services/google";
import { createSession, deleteSession } from "../../services/sessions";
import { config } from "../../config";

const auth = new Hono();

// Store pending auth states (in production, use Redis or similar)
const pendingStates = new Map<string, { createdAt: number }>();

// Cleanup old states periodically
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [state, data] of pendingStates) {
    if (data.createdAt < fiveMinutesAgo) {
      pendingStates.delete(state);
    }
  }
}, 60 * 1000);

auth.get("/login", (c) => {
  const state = nanoid(32);
  pendingStates.set(state, { createdAt: Date.now() });

  const authUrl = getAuthUrl(state);
  return c.redirect(authUrl);
});

auth.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const error = c.req.query("error");

  if (error) {
    return c.redirect(`/admin/login?error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return c.redirect("/admin/login?error=missing_params");
  }

  // Verify state
  if (!pendingStates.has(state)) {
    return c.redirect("/admin/login?error=invalid_state");
  }
  pendingStates.delete(state);

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Get user info
    const userInfo = await getUserInfo(tokens.access_token);

    // Check if email is allowed
    if (!isAllowedEmail(userInfo.email)) {
      return c.redirect("/admin/login?error=unauthorized");
    }

    // Create session
    const session = await createSession(userInfo.email);

    // Set session cookie
    setCookie(c, "finn_session", session.id, {
      path: "/",
      httpOnly: true,
      secure: config.publicUrl.startsWith("https"),
      sameSite: "Lax",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return c.redirect("/admin");
  } catch (err) {
    console.error("OAuth callback error:", err);
    return c.redirect("/admin/login?error=auth_failed");
  }
});

auth.post("/logout", async (c) => {
  const sessionId = c.req.header("Cookie")?.match(/finn_session=([^;]+)/)?.[1];

  if (sessionId) {
    await deleteSession(sessionId);
  }

  deleteCookie(c, "finn_session", { path: "/" });

  return c.json({ success: true });
});

auth.get("/me", async (c) => {
  const sessionId = c.req.header("Cookie")?.match(/finn_session=([^;]+)/)?.[1];

  if (!sessionId) {
    return c.json({ authenticated: false }, 401);
  }

  const { getSession } = await import("../../services/sessions");
  const session = await getSession(sessionId);

  if (!session) {
    return c.json({ authenticated: false }, 401);
  }

  return c.json({
    authenticated: true,
    email: session.email,
  });
});

export default auth;
