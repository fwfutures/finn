import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { parseCommand, handleCommand } from "./commands";
import { getOrCreateConversation, addMessage } from "../../services/conversations";
import { getOrCreateUser } from "../../services/users";
import { generateResponse } from "../../ai/provider";

type MentionEvent = SlackEventMiddlewareArgs<"app_mention"> & AllMiddlewareArgs;

export async function handleMention({ event, client, say }: MentionEvent) {
  const userId = event.user;
  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;

  // Remove the bot mention from the text
  const text = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!text) {
    await say({
      text: "Hi! How can I help you? Send me a message or use `help` to see available commands.",
      thread_ts: threadTs,
    });
    return;
  }

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
      await say({ text: response, thread_ts: threadTs });
      return;
    }

    // Get or create conversation for this thread
    const conversation = await getOrCreateConversation({
      userId: user.id,
      channelId,
      threadTs,
      model: user.preferredModel,
    });

    // Add user message to history
    await addMessage({
      conversationId: conversation.id,
      role: "user",
      content: text,
    });

    // Post thinking indicator in thread
    const typingMsg = await client.chat.postMessage({
      channel: channelId,
      text: "_Thinking..._",
      thread_ts: threadTs,
    });

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

      // Delete typing indicator and send response
      if (typingMsg.ts) {
        await client.chat.delete({
          channel: channelId,
          ts: typingMsg.ts,
        });
      }

      await say({ text: response.content, thread_ts: threadTs });
    } catch (error) {
      if (typingMsg.ts) {
        await client.chat.delete({
          channel: channelId,
          ts: typingMsg.ts,
        });
      }
      throw error;
    }
  } catch (error) {
    console.error("Error handling mention:", error);
    await say({
      text: "Sorry, I encountered an error processing your message. Please try again.",
      thread_ts: threadTs,
    });
  }
}
