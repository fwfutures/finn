<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { getConversation, type Conversation, type Message, type User } from "$lib/api";

  let conversation: Conversation | null = $state(null);
  let messages: Message[] = $state([]);
  let user: User | null = $state(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  let conversationId = $derived($page.params.id);

  onMount(async () => {
    try {
      const result = await getConversation(conversationId);
      conversation = result.conversation;
      messages = result.messages;
      user = result.user;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load conversation";
    } finally {
      loading = false;
    }
  });

  function formatTime(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
  }

  function formatTokens(input: number | null, output: number | null): string {
    if (!input && !output) return "";
    return `${input || 0} in / ${output || 0} out`;
  }
</script>

<svelte:head>
  <title>Conversation | Finn Admin</title>
</svelte:head>

<div class="page">
  <a href="/admin/conversations" class="back-link">&larr; Back to Conversations</a>

  {#if loading}
    <div class="loading">Loading conversation...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if conversation}
    <div class="conv-header">
      <h1>Conversation</h1>
      <div class="meta">
        <span class="badge {conversation.status === 'active' ? 'badge-success' : 'badge-muted'}">
          {conversation.status}
        </span>
        <span class="badge badge-muted">{conversation.model}</span>
      </div>
    </div>

    {#if user}
      <div class="user-info">
        <span>User:</span>
        <a href="/admin/users/{user.id}">{user.displayName || user.slackUsername || "Unknown"}</a>
      </div>
    {/if}

    <div class="messages">
      {#each messages as msg}
        <div class="message {msg.role}">
          <div class="message-header">
            <span class="role">{msg.role}</span>
            <span class="time">{formatTime(msg.createdAt)}</span>
            {#if msg.inputTokens || msg.outputTokens}
              <span class="tokens">{formatTokens(msg.inputTokens, msg.outputTokens)}</span>
            {/if}
          </div>
          <div class="message-content">
            {msg.content}
          </div>
        </div>
      {/each}
    </div>

    {#if messages.length === 0}
      <p class="empty">No messages in this conversation</p>
    {/if}
  {/if}
</div>

<style>
  .page {
    max-width: 800px;
  }

  .back-link {
    display: inline-block;
    margin-bottom: 1rem;
    color: var(--text-muted);
  }

  .back-link:hover {
    color: var(--primary);
  }

  .conv-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .meta {
    display: flex;
    gap: 0.5rem;
  }

  .user-info {
    margin-bottom: 1.5rem;
    color: var(--text-muted);
  }

  .user-info a {
    color: var(--primary);
  }

  .messages {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1rem;
  }

  .message.assistant {
    border-left: 3px solid var(--primary);
  }

  .message.user {
    border-left: 3px solid var(--success);
  }

  .message-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
  }

  .role {
    font-weight: 500;
    text-transform: capitalize;
  }

  .time {
    color: var(--text-muted);
  }

  .tokens {
    color: var(--text-muted);
    font-size: 0.75rem;
  }

  .message-content {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .empty {
    color: var(--text-muted);
    padding: 1rem;
  }

  .error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--danger);
    color: var(--danger);
    padding: 1rem;
    border-radius: var(--radius);
  }
</style>
