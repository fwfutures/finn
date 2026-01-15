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
app.use(
  "/auth/*",
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
app.get("/admin", async (c) => {
  return c.body(await Bun.file("./admin/build/client/index.html").text(), {
    headers: { "Content-Type": "text/html" },
  });
});
app.get("/admin/", async (c) => {
  return c.body(await Bun.file("./admin/build/client/index.html").text(), {
    headers: { "Content-Type": "text/html" },
  });
});
app.get("/admin/*", async (c) => {
  const reqPath = c.req.path;
  const filePath = `./admin/build/client${reqPath.replace(/^\/admin/, "")}`;

  const file = Bun.file(filePath);
  if (await file.exists()) {
    const ext = filePath.split(".").pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      js: "text/javascript",
      css: "text/css",
      html: "text/html",
      json: "application/json",
      png: "image/png",
      svg: "image/svg+xml",
      ico: "image/x-icon",
    };
    return c.body(await file.arrayBuffer(), {
      headers: { "Content-Type": mimeTypes[ext || ""] || "application/octet-stream" },
    });
  }

  // SPA fallback - serve index.html for client-side routing
  return c.body(await Bun.file("./admin/build/client/index.html").text(), {
    headers: { "Content-Type": "text/html" },
  });
});
