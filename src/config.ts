import { z } from "zod";

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3004),
  host: z.string().default("0.0.0.0"),
  publicUrl: z.string().url(),

  // Slack
  slackBotToken: z.string().startsWith("xoxb-"),
  slackAppToken: z.string().startsWith("xapp-"),
  slackSigningSecret: z.string().min(1),

  // AI Providers
  anthropicApiKey: z.string().startsWith("sk-ant-"),
  openrouterApiKey: z.string().optional(),

  // Google OAuth
  googleClientId: z.string().min(1),
  googleClientSecret: z.string().min(1),
  allowedEmails: z.string().transform((val) => val.split(",").map((e) => e.trim())),

  // Database
  databasePath: z.string().default("./data/finn.db"),

  // Session
  sessionSecret: z.string().min(32),

  // Defaults
  defaultModel: z.string().default("claude-opus"),
  defaultSystemPrompt: z.string().default("You are Finn, a helpful AI assistant."),
});

function loadConfig() {
  const env = process.env;

  const result = configSchema.safeParse({
    port: env.PORT,
    host: env.HOST,
    publicUrl: env.PUBLIC_URL,
    slackBotToken: env.SLACK_BOT_TOKEN,
    slackAppToken: env.SLACK_APP_TOKEN,
    slackSigningSecret: env.SLACK_SIGNING_SECRET,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    openrouterApiKey: env.OPENROUTER_API_KEY,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    allowedEmails: env.ALLOWED_EMAILS,
    databasePath: env.DATABASE_PATH,
    sessionSecret: env.SESSION_SECRET,
    defaultModel: env.DEFAULT_MODEL,
    defaultSystemPrompt: env.DEFAULT_SYSTEM_PROMPT,
  });

  if (!result.success) {
    console.error("Configuration validation failed:");
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join(".")}: ${error.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof configSchema>;
