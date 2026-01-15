import { App, LogLevel } from "@slack/bolt";
import { config } from "../config";
import { handleMessage } from "./handlers/message";
import { handleMention } from "./handlers/mention";

export const slackApp = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
  logLevel: LogLevel.INFO,
});

// Register event handlers
slackApp.message(handleMessage);
slackApp.event("app_mention", handleMention);

// Start the Slack app
export async function startSlackApp() {
  await slackApp.start();
  console.log("Slack app connected (Socket Mode)");
}
