import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useThemeStore } from '@/features/theme/useThemeStore';
import { mockApi, pagePlugins } from '@/test-utils';
import UserMenu from './UserMenu.vue';

afterEach(() => vi.unstubAllGlobals());

describe('UserMenu', () => {
  it('no se muestra sin sesión', () => {
    const w = mount(UserMenu, { global: pagePlugins() });
    expect(w.find('button').exists()).toBe(false);
  });

  async function openMenu() {
    const fetchMock = mockApi({
      'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }),
    });
    const w = mount(UserMenu, { global: pagePlugins(), attachTo: document.body });
    useAuthStore().user = {
      id: '018f0000-0000-7000-8000-000000000001',
      email: 'a@b.cl',
      name: 'Ana',
      mustChangePassword: false,
      roles: [],
      permissions: [],
    };
    await flushPromises();
    await w.get('button[aria-label="Menú de usuario: Ana"]').trigger('keydown', { key: 'Enter' });
    await flushPromises();
    return { w, fetchMock };
  }
  const items = () => [...document.body.querySelectorAll('[role="menuitem"]')];

  it('reúne contraseña, tema y salir como opciones con texto', async () => {
    const { w } = await openMenu();
    expect(items().map((i) => i.textContent?.trim())).toEqual([
      'Cambiar contraseña',
      'Cambiar a modo oscuro',
      'Cerrar sesión',
    ]);
    expect(document.body.textContent).toContain('a@b.cl');
    w.unmount();
  });

  it('el tema se alterna desde el menú', async () => {
    const { w } = await openMenu();
    (items()[1] as HTMLElement).click();
    await flushPromises();
    expect(useThemeStore().isDark).toBe(true);
    w.unmount();
  });

  it('cerrar sesión limpia el usuario y lleva al login', async () => {
    const { w, fetchMock } = await openMenu();
    (items()[2] as HTMLElement).click();
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'));
    expect(fetchMock).toHaveBeenCalled();
    expect(useAuthStore().user).toBeNull();
    expect(router.currentRoute.value.name).toBe('login');
    w.unmount();
  });
});
