import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { parseCommand, handleCommand } from "./commands";
import { getOrCreateConversation, addMessage } from "../../services/conversations";
import { getOrCreateUser } from "../../services/users";
import { generateResponse } from "../../ai/provider";

type MessageEvent = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs;

export async function handleMessage({ message, client, say }: MessageEvent) {
  // Only handle direct messages (DMs)
  if (message.channel_type !== "im") return;

  // Ignore bot messages and message changes
  if (message.subtype === "bot_message" || message.subtype === "message_changed") return;

  // Type guard for regular messages
  if (!("text" in message) || !message.text || !("user" in message) || !message.user) return;

  const text = message.text.trim();
  const userId = message.user;
  const channelId = message.channel;

  try {
    // Get or create user
    const userInfo = await client.users.info({ user: userId });
    const user = await getOrCreateUser({
      id: userId,
      slackTeamId: userInfo.user?.team_id,
      slackUsername: userInfo.user?.name,
      displayName: userInfo.user?.real_name || userInfo.user?.name,
      email: userInfo.user?.profile?.email,
    });

    // Check if this is a command
    const command = parseCommand(text);
    if (command) {
      const response = await handleCommand(command, user);
      await say(response);
      return;
    }

    // Get or create conversation for this DM
    const conversation = await getOrCreateConversation({
      userId: user.id,
      channelId,
      model: user.preferredModel,
    });

    // Add user message to history
    await addMessage({
      conversationId: conversation.id,
      role: "user",
      content: text,
    });

    // Show typing indicator
    await client.chat.postMessage({
      channel: channelId,
      text: "_Thinking..._",
    }).then(async (typingMsg) => {
      try {
        // Generate AI response
        const startTime = Date.now();
        const response = await generateResponse(conversation.id, user.preferredModel);
        const latencyMs = Date.now() - startTime;

        // Add assistant message to history
        await addMessage({
          conversationId: conversation.id,
          role: "assistant",
          content: response.content,
          model: response.model,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          latencyMs,
        });

        // Delete typing indicator and send actual response
        if (typingMsg.ts) {
          await client.chat.delete({
            channel: channelId,
            ts: typingMsg.ts,
          });
        }

        await say(response.content);
      } catch (error) {
        // Delete typing indicator on error
        if (typingMsg.ts) {
          await client.chat.delete({
            channel: channelId,
            ts: typingMsg.ts,
          });
        }
        throw error;
      }
    });
  } catch (error) {
    console.error("Error handling message:", error);
    await say("Sorry, I encountered an error processing your message. Please try again.");
  }
}
