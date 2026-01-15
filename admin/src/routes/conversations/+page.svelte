<script lang="ts">
  import { getConversations, getUsers, type Conversation, type User } from "$lib/api";

  let conversations: Conversation[] = $state([]);
  let users: Map<string, User> = $state(new Map());
  let total = $state(0);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let offset = $state(0);
  const limit = 50;
  let hasMounted = $state(false);

  $effect(() => {
    if (!hasMounted) {
      hasMounted = true;
      loadData();
    }
  });

  async function loadData() {
    try {
      const [convResult, usersResult] = await Promise.all([
        getConversations({ limit, offset }),
        getUsers(),
      ]);
      conversations = convResult.conversations;
      total = convResult.total;
      users = new Map(usersResult.users.map((u) => [u.id, u]));
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load conversations";
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    offset += limit;
    const result = await getConversations({ limit, offset });
    conversations = [...conversations, ...result.conversations];
  }

  function getUserName(userId: string): string {
    const user = users.get(userId);
    return user?.displayName || user?.slackUsername || "Unknown";
  }

  function formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  }
</script>

<svelte:head>
  <title>Conversations | Finn Admin</title>
</svelte:head>

<div class="page">
  <div class="header">
    <h1>Conversations</h1>
    <span class="count">{total} total</span>
  </div>

  {#if loading}
    <div class="loading">Loading conversations...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if conversations.length === 0}
    <p class="empty">No conversations yet</p>
  {:else}
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Model</th>
            <th>Status</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each conversations as conv}
            <tr>
              <td>
                <a href="/admin/users/{conv.userId}">{getUserName(conv.userId)}</a>
              </td>
              <td><span class="badge badge-muted">{conv.model}</span></td>
              <td>
                <span class="badge {conv.status === 'active' ? 'badge-success' : 'badge-muted'}">
                  {conv.status}
                </span>
              </td>
              <td class="muted">{formatTime(conv.updatedAt)}</td>
              <td>
                <a href="/admin/conversations/{conv.id}" class="btn btn-secondary">View</a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if conversations.length < total}
      <div class="load-more">
        <button class="btn btn-secondary" onclick={loadMore}>Load More</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    max-width: 1000px;
  }

  .header {
    display: flex;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .count {
    color: var(--text-muted);
    font-size: 0.875rem;
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

  .muted {
    color: var(--text-muted);
  }

  .load-more {
    margin-top: 1rem;
    text-align: center;
  }
</style>
