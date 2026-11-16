import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@inventarius/shared';
import { router } from '@/app/router';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { mockApi, pagePlugins } from '@/test-utils';
import CatalogPage from './CatalogPage.vue';

/** Los componentes montados se desmontan: comparten router y no deben seguir reaccionando a otros tests. */
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

async function mountSection(section: string, data: unknown[], permissions: Permission[]) {
  const fetchMock = mockApi({
    [`GET /api/v1/${section === 'statuses' ? 'status-labels' : section}`]: () => ({
      data,
      meta: { page: 1, pageSize: 25, total: data.length },
    }),
  });
  const global = pagePlugins();
  useAuthStore(global.plugins![0] as never).user = {
    id: '018f0000-0000-7000-8000-0000000000ff',
    email: 'x@y.cl',
    name: 'X',
    mustChangePassword: false,
    roles: [],
    permissions,
  };
  await router.push(`/catalogo/${section}`);
  await router.isReady();
  const wrapper = mount(CatalogPage, { global });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, fetchMock };
}

const status = (over: Record<string, unknown>) => ({
  id: '018f0000-0000-7000-8000-000000000001',
  name: 'Disponible',
  kind: 'deployable',
  active: true,
  isSystem: false,
  updatedAt: '2026-11-16T12:00:00.000Z',
  ...over,
});

describe('CatalogPage (RF-10 a RF-14)', () => {
  it('lista los estados con su tipo y marca el del sistema sin acciones destructivas', async () => {
    const { wrapper } = await mountSection(
      'statuses',
      [
        status({}),
        status({ id: '018f0000-0000-7000-8000-000000000002', name: 'Asignado', isSystem: true }),
      ],
      ['asset:read', 'catalog:write'],
    );
    expect(wrapper.text()).toContain('Desplegable');
    expect(wrapper.text()).toContain('Del sistema');
    expect(wrapper.find('button[aria-label="Eliminar Disponible"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="Eliminar Asignado"]').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="Desactivar Asignado"]').exists()).toBe(false);
  });

  it('un lector ve el catálogo sin botones de edición ni de alta', async () => {
    const { wrapper } = await mountSection(
      'categories',
      [
        {
          id: '018f0000-0000-7000-8000-000000000003',
          name: 'Notebooks',
          extension: 'none',
          active: true,
          updatedAt: '2026-11-16T12:00:00.000Z',
        },
      ],
      ['asset:read'],
    );
    expect(wrapper.text()).toContain('Notebooks');
    expect(wrapper.find('button[aria-label^="Editar"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Nueva categoría');
  });

  it('las secciones del catálogo son enlaces con nombre accesible', async () => {
    const { wrapper } = await mountSection('manufacturers', [], ['asset:read', 'catalog:write']);
    const nav = wrapper.get('nav[aria-label="Secciones del catálogo"]');
    expect(nav.findAll('a').map((a) => a.text())).toEqual([
      'Categorías',
      'Fabricantes',
      'Modelos',
      'Ubicaciones',
      'Estados',
    ]);
    expect(wrapper.text()).toContain('Aún no hay fabricantes');
  });

  it('el filtro de estado del registro viaja a la API', async () => {
    const { fetchMock } = await mountSection('manufacturers', [], ['asset:read']);
    await router.push('/catalogo/manufacturers?active=false&q=acme');
    await flushPromises();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('active=false') && u.includes('q=acme'))).toBe(true);
  });
});
