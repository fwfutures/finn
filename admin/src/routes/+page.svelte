<script lang="ts">
  import { onMount } from "svelte";
  import { getStats, type Stats } from "$lib/api";

  let stats: Stats | null = $state(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      stats = await getStats();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load stats";
    } finally {
      loading = false;
    }
  });

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
  <title>Dashboard | Finn Admin</title>
</svelte:head>

<div class="page">
  <h1>Dashboard</h1>

  {#if loading}
    <div class="loading">Loading stats...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if stats}
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Users</div>
        <div class="stat-value">{stats.totals.users}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Conversations</div>
        <div class="stat-value">{stats.totals.conversations}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Messages</div>
        <div class="stat-value">{stats.totals.messages}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Today's Messages</div>
        <div class="stat-value">{stats.today.messages}</div>
      </div>
    </div>

    <div class="section">
      <h2>Recent Activity</h2>
      {#if stats.recentActivity.length === 0}
        <p class="empty">No recent activity</p>
      {:else}
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Model</th>
                <th>Messages</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each stats.recentActivity as conv}
                <tr>
                  <td>
                    <a href="/admin/users/{conv.userId}">{conv.userName || "Unknown"}</a>
                  </td>
                  <td><span class="badge badge-muted">{conv.model}</span></td>
                  <td>{conv.messageCount}</td>
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
    max-width: 1000px;
  }

  h1 {
    margin-bottom: 1.5rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 1.25rem;
  }

  .stat-label {
    color: var(--text-muted);
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 600;
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
