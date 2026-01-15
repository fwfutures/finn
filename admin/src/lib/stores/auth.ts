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
      try {
        const result = await checkAuth();
        set({
          loading: false,
          authenticated: result.authenticated,
          email: result.email || null,
        });
        return result.authenticated;
      } catch {
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
