import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { mockApi, pagePlugins } from '@/test-utils';
import UserMenu from './UserMenu.vue';

afterEach(() => vi.unstubAllGlobals());

describe('UserMenu', () => {
  it('no se muestra sin sesión', () => {
    const w = mount(UserMenu, { global: pagePlugins() });
    expect(w.find('button').exists()).toBe(false);
  });

  it('cerrar sesión limpia el usuario y lleva al login', async () => {
    const fetchMock = mockApi({
      'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }),
    });
    const w = mount(UserMenu, { global: pagePlugins() });
    useAuthStore().user = {
      id: '018f0000-0000-7000-8000-000000000001',
      email: 'a@b.cl',
      name: 'Ana',
      mustChangePassword: false,
      roles: [],
      permissions: [],
    };
    await flushPromises();
    await w.get('button[aria-label="Cerrar sesión"]').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalled();
    expect(useAuthStore().user).toBeNull();
    expect(router.currentRoute.value.name).toBe('login');
  });
});
