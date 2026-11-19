import type { SessionUser } from '@inventarius/shared';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '@/shared/api/http';
import { formatDateTime, setFormatSettings } from '@/shared/format/format';
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

  it('load() toma la zona horaria de los ajustes; si fallan, la sesión sigue', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(user))
      .mockResolvedValueOnce(json({ timezone: 'UTC', defaultCurrency: 'CLP' }));
    await useAuthStore().load();
    expect(formatDateTime('2026-06-15T15:05:00.000Z')).toBe('15-06-2026 15:05');

    setActivePinia(createPinia());
    vi.mocked(fetch)
      .mockResolvedValueOnce(json(user))
      .mockResolvedValueOnce(json({ title: 'Error', status: 500 }, 500));
    const store = useAuthStore();
    await store.load();
    expect(store.user?.name).toBe('Ana');
    setFormatSettings({ timezone: 'America/Santiago' });
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
      .mockResolvedValueOnce(json({ timezone: 'America/Santiago', defaultCurrency: 'CLP' }))
      .mockResolvedValueOnce(json({ token: 't' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = useAuthStore();
    await store.load();
    await store.logout();
    expect(store.user).toBeNull();
  });
});
