import { sessionUserSchema, type Permission, type SessionUser } from '@inventarius/shared';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { z } from 'zod';
import { ApiError, api, resetCsrfToken } from '@/shared/api/http';

/** Sesión del usuario actual. El front solo oculta lo que no se puede hacer; el backend es la barrera. */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<SessionUser | null>(null);
  const ready = ref(false);

  const isAuthenticated = computed(() => user.value !== null);

  async function load(): Promise<void> {
    try {
      user.value = await api('/api/v1/auth/me', sessionUserSchema, { silent401: true });
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) {
        user.value = null;
        ready.value = true;
        throw e;
      }
      user.value = null;
    }
    ready.value = true;
  }

  async function login(email: string, password: string): Promise<void> {
    user.value = await api('/api/v1/auth/login', sessionUserSchema, {
      method: 'POST',
      body: { email, password },
      silent401: true,
    });
    resetCsrfToken();
  }

  async function logout(): Promise<void> {
    try {
      await api('/api/v1/auth/logout', z.null(), { method: 'POST' });
    } finally {
      clear();
    }
  }

  async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
    user.value = await api('/api/v1/auth/change-password', sessionUserSchema, {
      method: 'POST',
      body: { currentPassword, newPassword },
    });
    resetCsrfToken();
  }

  /** Olvida la sesión local (logout o 401 del servidor). */
  function clear(): void {
    user.value = null;
    resetCsrfToken();
  }

  const can = (permission: Permission): boolean =>
    user.value?.permissions.includes(permission) ?? false;
  const canAny = (permissions: readonly Permission[]): boolean =>
    permissions.length === 0 || permissions.some((p) => can(p));

  return { user, ready, isAuthenticated, load, login, logout, changePassword, clear, can, canAny };
});
