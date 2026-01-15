<script lang="ts">
  import { getModels, updateModel, getUsage, type Model, type UsageData } from "$lib/api";

  let models: Model[] = $state([]);
  let usage: UsageData | null = $state(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let updating = $state<string | null>(null);
  let hasMounted = $state(false);

  $effect(() => {
    if (!hasMounted) {
      hasMounted = true;
      loadData();
    }
  });

  async function loadData() {
    try {
      const [modelsResult, usageResult] = await Promise.all([getModels(), getUsage(30)]);
      models = modelsResult.models;
      usage = usageResult;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load settings";
    } finally {
      loading = false;
    }
  }

  async function toggleModel(model: Model) {
    updating = model.id;
    try {
      const result = await updateModel(model.id, { enabled: !model.enabled });
      models = models.map((m) => (m.id === model.id ? result.model : m));
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update model";
    } finally {
      updating = null;
    }
  }

  function formatNumber(n: number): string {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toString();
  }
</script>

<svelte:head>
  <title>Settings | Finn Admin</title>
</svelte:head>

<div class="page">
  <h1>Settings</h1>

  {#if loading}
    <div class="loading">Loading settings...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else}
    <div class="section">
      <h2>AI Models</h2>
      <p class="description">Enable or disable models available to users.</p>

      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Model</th>
              <th>Provider</th>
              <th>Model ID</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each models as model}
              <tr>
                <td>
                  <strong>{model.displayName}</strong>
                  <span class="alias">{model.id}</span>
                </td>
                <td>
                  <span class="badge badge-muted">{model.provider}</span>
                </td>
                <td class="muted model-id">{model.modelId}</td>
                <td>
                  <span class="badge {model.enabled ? 'badge-success' : 'badge-danger'}">
                    {model.enabled ? "Enabled" : "Disabled"}
                  </span>
                </td>
                <td>
                  <button
                    class="btn {model.enabled ? 'btn-secondary' : 'btn-primary'}"
                    onclick={() => toggleModel(model)}
                    disabled={updating === model.id}
                  >
                    {model.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>

    {#if usage}
      <div class="section">
        <h2>Usage by Model (Last 30 Days)</h2>
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Messages</th>
                <th>Input Tokens</th>
                <th>Output Tokens</th>
              </tr>
            </thead>
            <tbody>
              {#each usage.modelUsage as item}
                <tr>
                  <td><span class="badge badge-muted">{item.model}</span></td>
                  <td>{item.messages}</td>
                  <td class="muted">{formatNumber(item.inputTokens)}</td>
                  <td class="muted">{formatNumber(item.outputTokens)}</td>
                </tr>
              {/each}
              {#if usage.modelUsage.length === 0}
                <tr>
                  <td colspan="4" class="empty">No usage data</td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>

      <div class="section">
        <h2>Top Users (Last 30 Days)</h2>
        <div class="card">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Messages</th>
                <th>Total Tokens</th>
              </tr>
            </thead>
            <tbody>
              {#each usage.topUsers as item}
                <tr>
                  <td>
                    <a href="/admin/users/{item.id}">
                      {item.displayName || item.slackUsername || "Unknown"}
                    </a>
                  </td>
                  <td>{item.messages}</td>
                  <td class="muted">{formatNumber(item.totalTokens)}</td>
                </tr>
              {/each}
              {#if usage.topUsers.length === 0}
                <tr>
                  <td colspan="3" class="empty">No usage data</td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .page {
    max-width: 1000px;
  }

  h1 {
    margin-bottom: 1.5rem;
  }

  .section {
    margin-bottom: 2rem;
  }

  .section h2 {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
  }

  .description {
    color: var(--text-muted);
    margin-bottom: 1rem;
  }

  .alias {
    display: block;
    color: var(--text-muted);
    font-size: 0.875rem;
    font-weight: normal;
  }

  .model-id {
    font-family: monospace;
    font-size: 0.75rem;
  }

  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: 1rem;
  }

  .error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--danger);
    color: var(--danger);
    padding: 1rem;
    border-radius: var(--radius);
    margin-bottom: 1rem;
  }

  .muted {
    color: var(--text-muted);
  }
</style>
