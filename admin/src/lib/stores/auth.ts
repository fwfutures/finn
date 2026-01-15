import { writable } from "svelte/store";
import { checkAuth } from "$lib/api";

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  email: string | null;
}

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>({
    loading: true,
    authenticated: false,
    email: null,
  });

  return {
    subscribe,
    async check() {
      console.log("[auth] check() called");
      try {
        const result = await checkAuth();
        console.log("[auth] checkAuth result:", result);
        set({
          loading: false,
          authenticated: result.authenticated,
          email: result.email || null,
        });
        return result.authenticated;
      } catch (err) {
        console.error("[auth] check() error:", err);
        set({ loading: false, authenticated: false, email: null });
        return false;
      }
    },
    clear() {
      set({ loading: false, authenticated: false, email: null });
    },
  };
}

export const auth = createAuthStore();
