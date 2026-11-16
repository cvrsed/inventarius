import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@inventarius/shared';
import { router } from '@/app/router';
import { useConfirm } from '@/shared/ui/useConfirm';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import CatalogPage from './CatalogPage.vue';

/** Los componentes montados se desmontan: comparten router y no deben seguir reaccionando a otros tests. */
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

async function mountSection(
  section: string,
  data: unknown[],
  permissions: Permission[],
  extra: Parameters<typeof mockApi>[0] = {},
) {
  const fetchMock = mockApi({
    ...extra,
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

  it('desactivar y activar mandan PATCH con la versión', async () => {
    const item = status({});
    const { wrapper, fetchMock } = await mountSection(
      'statuses',
      [item],
      ['asset:read', 'catalog:write'],
      {
        [`PATCH /api/v1/status-labels/${item.id}`]: () => ({ ...item, active: false }),
      },
    );
    await wrapper.get('button[aria-label="Desactivar Disponible"]').trigger('click');
    await flushPromises();
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ active: false });
    expect((call[1]!.headers as Record<string, string>)['if-match']).toBe(`"${item.updatedAt}"`);
  });

  it('eliminar pide confirmación y luego llama a DELETE', async () => {
    const item = status({});
    const { wrapper, fetchMock } = await mountSection(
      'statuses',
      [item],
      ['asset:read', 'catalog:write'],
      {
        [`DELETE /api/v1/status-labels/${item.id}`]: () => jsonResponse(null, 204),
      },
    );
    await wrapper.get('button[aria-label="Eliminar Disponible"]').trigger('click');
    const { state, close } = useConfirm();
    expect(state.open).toBe(true);
    expect(state.options?.danger).toBe(true);
    expect(state.options?.message).toContain('Disponible');
    await state.options!.accept();
    close();
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(true);
  });

  it('el botón de alta abre el formulario de la sección', async () => {
    const { wrapper } = await mountSection('categories', [], ['asset:read', 'catalog:write']);
    await wrapper.get('button').trigger('click');
    const alta = wrapper.findAll('button').find((b) => b.text() === 'Nueva categoría')!;
    await alta.trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Tipo de extensión');
  });

  it('escribir en la búsqueda actualiza la URL tras una pausa', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper } = await mountSection('categories', [], ['asset:read']);
      await wrapper.get('input[type="search"]').setValue('sensores');
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();
      expect(router.currentRoute.value.query['q']).toBe('sensores');
    } finally {
      vi.useRealTimers();
    }
  });
});
