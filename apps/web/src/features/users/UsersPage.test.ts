import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pagePlugins, useMobileViewport } from '@/test-utils';
import UsersPage from './UsersPage.vue';

afterEach(() => vi.unstubAllGlobals());

const user = (n: number) => ({
  id: `018f0000-0000-7000-8000-00000000000${n}`,
  email: `u${n}@ejemplo.cl`,
  name: `Usuario ${n}`,
  active: n !== 2,
  mustChangePassword: false,
  roles: [{ id: `018f0000-0000-7000-8000-0000000000a${n}`, name: 'Lector' }],
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
});

function mountPage() {
  return mount(UsersPage, { global: pagePlugins() });
}

describe('UsersPage', () => {
  it('lista usuarios con su estado y acciones accesibles', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: [user(1), user(2)], meta: { page: 1, pageSize: 10, total: 2 } }),
            { status: 200 },
          ),
        ),
    );
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain('Usuario 1');
    expect(wrapper.text()).toContain('Inactivo');
    expect(wrapper.find('button[aria-label="Editar Usuario 1"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Restablecer contraseña Usuario 2"]').exists()).toBe(
      true,
    );
  });

  it('en móvil cada usuario es una tarjeta con correo y acciones con texto', async () => {
    useMobileViewport();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: [user(1)], meta: { page: 1, pageSize: 10, total: 1 } }),
            { status: 200 },
          ),
        ),
    );
    const wrapper = mountPage();
    await flushPromises();
    const card = wrapper.get('ul > li');
    expect(card.text()).toContain('u1@ejemplo.cl');
    expect(card.findAll('button').map((b) => b.text())).toEqual([
      'Editar',
      'Restablecer contraseña',
    ]);
  });

  it('muestra el estado vacío cuando no hay usuarios', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: [], meta: { page: 1, pageSize: 10, total: 0 } }), {
          status: 200,
        }),
      ),
    );
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain('Aún no hay usuarios');
  });

  it('muestra un error con reintento si la API falla', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('Reintentar');
  });
});
