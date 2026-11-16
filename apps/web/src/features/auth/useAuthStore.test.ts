import type { SessionUser } from '@inventarius/shared';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '@/shared/api/http';
import { useAuthStore } from './useAuthStore';

const user: SessionUser = {
  id: '018f0000-0000-7000-8000-000000000001',
  email: 'ana@ejemplo.cl',
  name: 'Ana',
  mustChangePassword: false,
  roles: ['Operador'],
  permissions: ['asset:read', 'asset:write'],
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  setActivePinia(createPinia());
  resetCsrfToken();
  vi.stubGlobal('fetch', vi.fn());
});

describe('useAuthStore', () => {
  it('load() carga el usuario y marca ready; un 401 deja anónimo sin error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(user));
    const store = useAuthStore();
    await store.load();
    expect(store.ready).toBe(true);
    expect(store.user?.email).toBe('ana@ejemplo.cl');

    setActivePinia(createPinia());
    vi.mocked(fetch).mockResolvedValueOnce(json({ title: 'No autenticado', status: 401 }, 401));
    const anon = useAuthStore();
    await anon.load();
    expect(anon.ready).toBe(true);
    expect(anon.user).toBeNull();
  });

  it('can() / canAny() consultan los permisos del usuario', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json(user));
    const store = useAuthStore();
    await store.load();
    expect(store.can('asset:write')).toBe(true);
    expect(store.can('user:manage')).toBe(false);
    expect(store.canAny(['user:manage', 'asset:read'])).toBe(true);
    expect(store.canAny([])).toBe(true);
  });

  it('login() guarda el usuario devuelto', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ token: 't' }))
      .mockResolvedValueOnce(json(user));
    const store = useAuthStore();
    await store.login('ana@ejemplo.cl', 'clave-clave-clave');
    expect(store.user?.name).toBe('Ana');
  });

  it('logout() limpia el usuario', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(user))
      .mockResolvedValueOnce(json({ token: 't' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = useAuthStore();
    await store.load();
    await store.logout();
    expect(store.user).toBeNull();
  });
});
