<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { auth } from "$lib/stores/auth";
  import { logout } from "$lib/api";
  import "../app.css";

  let currentPath = $derived($page.url.pathname);
  let hasCheckedAuth = $state(false);

  const navItems = [
    { href: "/admin", label: "Dashboard", icon: "📊" },
    { href: "/admin/users", label: "Users", icon: "👥" },
    { href: "/admin/conversations", label: "Conversations", icon: "💬" },
    { href: "/admin/settings", label: "Settings", icon: "⚙️" },
  ];

  // Check auth on mount (runs once)
  $effect(() => {
    if (!hasCheckedAuth) {
      hasCheckedAuth = true;
      auth.check();
    }
  });

  // Redirect to login if not authenticated
  $effect(() => {
    if (!$auth.loading && !$auth.authenticated && !currentPath.includes("/login")) {
      goto("/admin/login");
    }
  });

  async function handleLogout() {
    await logout();
    auth.clear();
  }
</script>

{#if $auth.loading}
  <div class="loading-screen">
    <p>Loading...</p>
  </div>
{:else if currentPath.includes("/login")}
  <slot />
{:else}
  <div class="layout">
    <nav class="sidebar">
      <div class="logo">
        <h1>🐬 Finn</h1>
      </div>

      <ul class="nav-items">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              class:active={currentPath === item.href ||
                (item.href !== "/admin" && currentPath.startsWith(item.href))}
            >
              <span class="icon">{item.icon}</span>
              {item.label}
            </a>
          </li>
        {/each}
      </ul>

      <div class="sidebar-footer">
        <div class="user-info">
          <span class="email">{$auth.email}</span>
        </div>
        <button class="btn btn-secondary" onclick={handleLogout}>Logout</button>
      </div>
    </nav>

    <main class="content">
      <slot />
    </main>
  </div>
{/if}

<style>
  .loading-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: var(--text-muted);
  }

  .layout {
    display: flex;
    min-height: 100vh;
  }

  .sidebar {
    width: 240px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    position: fixed;
    height: 100vh;
  }

  .logo {
    padding: 1.5rem;
    border-bottom: 1px solid var(--border);
  }

  .logo h1 {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .nav-items {
    list-style: none;
    padding: 1rem 0;
    flex: 1;
  }

  .nav-items a {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1.5rem;
    color: var(--text-muted);
    transition: all 0.2s;
  }

  .nav-items a:hover {
    color: var(--text);
    background: var(--bg-tertiary);
    text-decoration: none;
  }

  .nav-items a.active {
    color: var(--primary);
    background: rgba(59, 130, 246, 0.1);
    border-right: 2px solid var(--primary);
  }

  .icon {
    font-size: 1.1rem;
  }

  .sidebar-footer {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--border);
  }

  .user-info {
    margin-bottom: 0.75rem;
  }

  .email {
    font-size: 0.875rem;
    color: var(--text-muted);
  }

  .content {
    flex: 1;
    margin-left: 240px;
    padding: 2rem;
  }
</style>
