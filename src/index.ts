import { serve } from "bun";
import { config } from "./config";
import { app } from "./web/server";
import { initializeDatabase, closeDatabase } from "./store";
import { startSlackApp } from "./slack/app";

// Initialize database
initializeDatabase();

// Start HTTP server
const server = serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
});

console.log(`Finn server running on http://${config.host}:${config.port}`);

// Start Slack app
startSlackApp().catch((err) => {
  console.error("Failed to start Slack app:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down...");
  closeDatabase();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\nShutting down...");
  closeDatabase();
  server.stop();
  process.exit(0);
});
