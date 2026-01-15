<script lang="ts">
  import { getUsers, type User } from "$lib/api";

  let users: User[] = $state([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let hasMounted = $state(false);

  $effect(() => {
    if (!hasMounted) {
      hasMounted = true;
      loadData();
    }
  });

  async function loadData() {
    try {
      const result = await getUsers();
      users = result.users;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load users";
    } finally {
      loading = false;
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp * 1000).toLocaleDateString();
  }

  function getRoleBadgeClass(role: string): string {
    switch (role) {
      case "super_admin":
        return "badge-warning";
      case "admin":
        return "badge-success";
      default:
        return "badge-muted";
    }
  }
</script>

<svelte:head>
  <title>Users | Finn Admin</title>
</svelte:head>

<div class="page">
  <div class="header">
    <h1>Users</h1>
    <span class="count">{users.length} total</span>
  </div>

  {#if loading}
    <div class="loading">Loading users...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if users.length === 0}
    <p class="empty">No users yet</p>
  {:else}
    <div class="card">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Role</th>
            <th>Model</th>
            <th>Joined</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each users as user}
            <tr>
              <td>
                <div class="user-info">
                  <strong>{user.displayName || user.slackUsername || "Unknown"}</strong>
                  {#if user.slackUsername}
                    <span class="username">@{user.slackUsername}</span>
                  {/if}
                </div>
              </td>
              <td class="muted">{user.email || "-"}</td>
              <td>
                <span class="badge {getRoleBadgeClass(user.role)}">{user.role}</span>
              </td>
              <td><span class="badge badge-muted">{user.preferredModel}</span></td>
              <td class="muted">{formatDate(user.createdAt)}</td>
              <td>
                <a href="/admin/users/{user.id}" class="btn btn-secondary">View</a>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
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

  .user-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .username {
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
</style>
