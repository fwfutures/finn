import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { parseCommand, handleCommand } from "./commands";
import { getOrCreateConversation, addMessage } from "../../services/conversations";
import { getOrCreateUser } from "../../services/users";
import { generateResponse } from "../../ai/provider";
import { processSlackFiles, type Attachment } from "../../services/attachments";

type MessageEvent = SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs;

export async function handleMessage({ message, client, say }: MessageEvent) {
  // Only handle direct messages (DMs)
  if (message.channel_type !== "im") return;

  // Ignore bot messages and message changes
  if (message.subtype === "bot_message" || message.subtype === "message_changed") return;

  // Type guard for regular messages with user
  if (!("user" in message) || !message.user) return;

  // Get text (may be empty if only attachments)
  const text = ("text" in message && message.text) ? message.text.trim() : "";
  const userId = message.user;
  const channelId = message.channel;

  // Use thread_ts if replying in a thread, otherwise use message ts to start a new thread
  // This means each top-level message creates a new conversation thread
  const threadTs = ("thread_ts" in message && message.thread_ts)
    ? message.thread_ts
    : ("ts" in message ? message.ts : undefined);

  // Get files from message (if any)
  const files = ("files" in message && Array.isArray(message.files)) ? message.files : [];

  // Skip if no text and no files
  if (!text && files.length === 0) return;

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

    // Check if this is a command (commands don't have attachments)
    if (text && files.length === 0) {
      const command = parseCommand(text);
      if (command) {
        const response = await handleCommand(command, user);
        await say({ text: response, thread_ts: threadTs });
        return;
      }
    }

    // Get or create conversation for this thread
    const conversation = await getOrCreateConversation({
      userId: user.id,
      channelId,
      threadTs,
      model: user.preferredModel,
    });

    // Process attachments if present
    let attachments: Attachment[] = [];
    if (files.length > 0) {
      attachments = await processSlackFiles(files, client);
    }

    // Add user message to history
    await addMessage({
      conversationId: conversation.id,
      role: "user",
      content: text,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    // Show typing indicator in thread
    const typingMsg = await client.chat.postMessage({
      channel: channelId,
      text: "_Thinking..._",
      thread_ts: threadTs,
    });

    try {
      // Generate AI response
      const startTime = Date.now();
      const response = await generateResponse(conversation.id, user.preferredModel, {
        user,
        conversation,
      });
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

      await say({ text: response.content, thread_ts: threadTs });
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
  } catch (error) {
    console.error("Error handling message:", error);
    await say({
      text: "Sorry, I encountered an error processing your message. Please try again.",
      thread_ts: threadTs
    });
  }
}
