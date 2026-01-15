<script lang="ts">
  import { page } from "$app/stores";
  import { getUser, updateUserRole, type User, type Conversation } from "$lib/api";

  let user: User | null = $state(null);
  let conversations: Conversation[] = $state([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let updating = $state(false);
  let hasMounted = $state(false);

  let userId = $derived($page.params.id);

  $effect(() => {
    if (!hasMounted) {
      hasMounted = true;
      loadData();
    }
  });

  async function loadData() {
    try {
      const result = await getUser(userId);
      user = result.user;
      conversations = result.conversations;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load user";
    } finally {
      loading = false;
    }
  }

  async function handleRoleChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const newRole = select.value;

    if (!user) return;

    updating = true;
    try {
      const result = await updateUserRole(user.id, newRole);
      user = result.user;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update role";
      select.value = user.role;
    } finally {
      updating = false;
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleString();
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
  <title>{user?.displayName || "User"} | Finn Admin</title>
</svelte:head>

<div class="page">
  <a href="/admin/users" class="back-link">&larr; Back to Users</a>

  {#if loading}
    <div class="loading">Loading user...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if user}
    <div class="user-header">
      <h1>{user.displayName || user.slackUsername || "Unknown User"}</h1>
      {#if user.slackUsername}
        <span class="username">@{user.slackUsername}</span>
      {/if}
    </div>

    <div class="details-grid">
      <div class="card">
        <h2>Details</h2>
        <dl>
          <dt>Slack ID</dt>
          <dd>{user.id}</dd>

          <dt>Email</dt>
          <dd>{user.email || "-"}</dd>

          <dt>Role</dt>
          <dd>
            <select value={user.role} onchange={handleRoleChange} disabled={updating}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </dd>

          <dt>Preferred Model</dt>
          <dd>{user.preferredModel}</dd>

          <dt>Joined</dt>
          <dd>{formatDate(user.createdAt)}</dd>

          <dt>Last Updated</dt>
          <dd>{formatDate(user.updatedAt)}</dd>
        </dl>
      </div>
    </div>

    <div class="section">
      <h2>Recent Conversations</h2>
      {#if conversations.length === 0}
        <p class="empty">No conversations yet</p>
      {:else}
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each conversations as conv}
                <tr>
                  <td><span class="badge badge-muted">{conv.model}</span></td>
                  <td>
                    <span
                      class="badge {conv.status === 'active' ? 'badge-success' : 'badge-muted'}"
                    >
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
      {/if}
    </div>
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

  .user-header {
    margin-bottom: 1.5rem;
  }

  .user-header h1 {
    margin-bottom: 0.25rem;
  }

  .username {
    color: var(--text-muted);
  }

  .details-grid {
    margin-bottom: 2rem;
  }

  .card h2 {
    font-size: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border);
  }

  dl {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 0.75rem 1rem;
  }

  dt {
    color: var(--text-muted);
    font-size: 0.875rem;
  }

  dd {
    margin: 0;
  }

  select {
    padding: 0.25rem 0.5rem;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
  }

  select:disabled {
    opacity: 0.5;
  }

  .section {
    margin-top: 2rem;
  }

  .section h2 {
    font-size: 1.25rem;
    margin-bottom: 1rem;
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
</style>
