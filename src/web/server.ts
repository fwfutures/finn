import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import { config } from "../config";
import authRoutes from "./routes/auth";
import apiRoutes from "./routes/api";

export const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: config.publicUrl,
    credentials: true,
  })
);

// Health check
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: Date.now() });
});

// Root endpoint
app.get("/", (c) => {
  return c.json({
    name: "Finn",
    description: "Slack Bot Agent powered by Claude SDK",
    version: "1.0.0",
  });
});

// Auth routes
app.route("/auth", authRoutes);

// API routes
app.route("/api", apiRoutes);

// Serve SvelteKit admin UI
app.use("/admin/*", serveStatic({ root: "./admin/build/client" }));
app.get("/admin", serveStatic({ path: "./admin/build/client/index.html" }));
