import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { globalPlugins } from '@/test-utils';
import AppLayout from './AppLayout.vue';

afterEach(() => vi.unstubAllGlobals());

function signIn(permissions: string[]): void {
  const auth = useAuthStore();
  auth.ready = true;
  auth.user = {
    id: '018f0000-0000-7000-8000-000000000001',
    email: 'ana@ejemplo.cl',
    name: 'Ana',
    mustChangePassword: false,
    roles: ['Operador'],
    permissions: permissions as never,
  };
}

describe('AppLayout', () => {
  it('tiene enlace para saltar al contenido, navegación y landmark main', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await router.push('/');
    await router.isReady();
    const global = globalPlugins();
    const wrapper = mount(AppLayout, { global });
    signIn(['asset:read']);
    await flushPromises();

    expect(wrapper.get('a.app-skip-link').attributes('href')).toBe('#contenido');
    expect(wrapper.find('main#contenido').exists()).toBe(true);
    expect(wrapper.findAll('nav[aria-label="Navegación principal"]')).toHaveLength(2);
    expect(wrapper.get('h1').text()).toBe('Inicio');
  });

  it('el botón de tema tiene nombre accesible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    await router.push('/');
    const wrapper = mount(AppLayout, { global: globalPlugins() });
    const toggle = wrapper.get('button[aria-label="Cambiar a modo oscuro"]');
    await toggle.trigger('click');
    expect(wrapper.find('button[aria-label="Cambiar a modo claro"]').exists()).toBe(true);
  });

  it('el menú muestra solo lo permitido por los permisos del usuario', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await router.push('/');
    const wrapper = mount(AppLayout, { global: globalPlugins() });
    signIn(['asset:read', 'audit:read']);
    await flushPromises();
    const labels = wrapper.findAll('nav a').map((a) => a.text());
    expect(labels).toContain('Inicio');
    expect(labels).toContain('Auditoría');
    expect(labels).not.toContain('Usuarios');
    expect(labels).not.toContain('Roles');
  });

  it('en el login no hay menú', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await router.push({ name: 'login' }).catch(() => undefined);
    const wrapper = mount(AppLayout, { global: globalPlugins() });
    await flushPromises();
    expect(wrapper.findAll('nav')).toHaveLength(0);
  });
});
