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
  useConfirm().close();
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
    [`GET /api/v1/${PATH[section] ?? section}`]: () => ({
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

const PATH: Record<string, string> = {
  statuses: 'status-labels',
  consumableCategories: 'categories',
  units: 'measure-units',
};

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
    expect(wrapper.text()).toContain('Asignable');
    expect(wrapper.text()).toContain('Del sistema');
    expect(wrapper.find('button[aria-label="Eliminar Disponible"]').exists()).toBe(true);
    const blocked = wrapper.get('button[aria-label="Eliminar Asignado"]');
    expect(blocked.attributes('disabled')).toBeDefined();
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
          scope: 'asset',
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

  it('el subtítulo menciona también los consumibles, no solo los activos (P17)', async () => {
    const { wrapper } = await mountSection('categories', [], ['asset:read']);
    const subtitle = wrapper.get('h1 + p').text();
    expect(subtitle).toContain('categorías de consumibles');
    expect(subtitle).toContain('unidades de medida');
    expect(subtitle).not.toContain('que usan los activos');
  });

  it('las categorías de consumibles se administran con consumables:manage, no con catalog:write (P4)', async () => {
    const withManage = await mountSection(
      'consumableCategories',
      [],
      ['consumables:read', 'consumables:manage'],
    );
    expect(withManage.wrapper.text()).toContain('Nueva categoría de consumibles');
    withManage.wrapper.unmount();
    mounted.pop();
    const withCatalog = await mountSection(
      'consumableCategories',
      [],
      ['consumables:read', 'asset:read', 'catalog:write'],
    );
    expect(withCatalog.wrapper.text()).not.toContain('Nueva categoría de consumibles');
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

  it('la pestaña activa refleja la ruta al entrar directo, sin clic previo', async () => {
    for (const [section, label] of [
      ['categories', 'Categorías'],
      ['manufacturers', 'Fabricantes'],
      ['models', 'Modelos'],
      ['locations', 'Ubicaciones'],
      ['statuses', 'Estados'],
    ] as const) {
      const { wrapper } = await mountSection(section, [], ['asset:read']);
      const current = wrapper.findAll('nav a[aria-current="page"]');
      expect(current.map((a) => a.text())).toEqual([label]);
      wrapper.unmount();
    }
  });

  it('en móvil las secciones son un select que muestra la actual y navega al cambiar', async () => {
    const { wrapper } = await mountSection('locations', [], ['asset:read']);
    const select = wrapper.get('button[aria-label="Sección del catálogo"]');
    expect(select.text()).toContain('Ubicaciones');
    await router.push('/catalogo/models');
    await flushPromises();
    expect(wrapper.get('button[aria-label="Sección del catálogo"]').text()).toContain('Modelos');
  });

  it('/catalogo y una sección desconocida redirigen a la primera sección', async () => {
    await router.push('/catalogo');
    expect(router.currentRoute.value.fullPath).toBe('/catalogo/categories');
    await router.push('/catalogo/inexistente?q=a');
    expect(router.currentRoute.value.fullPath).toBe('/catalogo/categories?q=a');
  });

  it('el filtro de estado del registro viaja a la API', async () => {
    const { fetchMock } = await mountSection('manufacturers', [], ['asset:read']);
    await router.push('/catalogo/manufacturers?active=false&q=acme');
    await flushPromises();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('active=false') && u.includes('q=acme'))).toBe(true);
  });

  it('desactivar pide confirmación y manda PATCH con la versión solo si se acepta; activar no pregunta (P18)', async () => {
    const item = status({});
    const { wrapper, fetchMock } = await mountSection(
      'statuses',
      [item],
      ['asset:read', 'catalog:write'],
      {
        [`PATCH /api/v1/status-labels/${item.id}`]: () => ({ ...item, active: false }),
      },
    );
    const patches = () => fetchMock.mock.calls.filter((c) => c[1]?.method === 'PATCH');
    await wrapper.get('button[aria-label="Desactivar Disponible"]').trigger('click');
    await flushPromises();
    const confirm = useConfirm();
    expect(confirm.state.open).toBe(true);
    expect(confirm.state.options?.title).toBe('Desactivar estado');
    expect(confirm.state.options?.message).toContain('¿Desactivar «Disponible»?');
    expect(confirm.state.options?.message).toContain('puedes volver a activarlo');
    expect(patches()).toHaveLength(0);
    await confirm.state.options!.accept();
    await flushPromises();
    const call = patches()[0]!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ active: false });
    expect((call[1]!.headers as Record<string, string>)['if-match']).toBe(`"${item.updatedAt}"`);
  });

  it('activar un registro inactivo no pide confirmación', async () => {
    const item = status({ active: false });
    const { wrapper, fetchMock } = await mountSection(
      'statuses',
      [item],
      ['asset:read', 'catalog:write'],
      {
        [`PATCH /api/v1/status-labels/${item.id}`]: () => ({ ...item, active: true }),
      },
    );
    await wrapper.get('button[aria-label="Activar Disponible"]').trigger('click');
    await flushPromises();
    expect(useConfirm().state.open).toBe(false);
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ active: true });
  });

  it('el botón de activar/desactivar usa un ícono de encendido, no el ojo que se confunde con «ver» (P18)', async () => {
    const { wrapper } = await mountSection(
      'statuses',
      [
        status({}),
        status({ id: '018f0000-0000-7000-8000-000000000009', name: 'Inactivo', active: false }),
      ],
      ['asset:read', 'catalog:write'],
    );
    const drawing = (label: string) => wrapper.get(`button[aria-label="${label}"] svg`).html();
    const off = drawing('Desactivar Disponible');
    const on = drawing('Activar Inactivo');
    expect(off).not.toBe(on);
    const eye = [
      // Trazados del ojo y del ojo tachado de Lucide: ninguno de los dos botones los dibuja.
      'M2.062 12.348',
      'm2 2 20 20',
    ];
    for (const d of [off, on]) for (const part of eye) expect(d).not.toContain(part);
    // El tooltip dice lo mismo que el nombre accesible.
    expect(wrapper.html()).toContain('Desactivar Disponible');
  });

  it('desactivar una bodega con stock avisa cuántos consumibles hay y solo sigue si se confirma (P7)', async () => {
    const warehouse = {
      id: '018f0000-0000-7000-8000-0000000000b1',
      name: 'Bodega central',
      parent: null,
      path: 'Bodega central',
      type: 'warehouse',
      address: null,
      active: true,
      stockedConsumables: 3,
      updatedAt: '2026-11-16T12:00:00.000Z',
    };
    const { wrapper, fetchMock } = await mountSection(
      'locations',
      [warehouse],
      ['asset:read', 'catalog:write'],
      { [`PATCH /api/v1/locations/${warehouse.id}`]: () => ({ ...warehouse, active: false }) },
    );
    await wrapper.get('button[aria-label="Desactivar Bodega central"]').trigger('click');
    await flushPromises();
    const confirm = useConfirm();
    expect(confirm.state.open).toBe(true);
    expect(confirm.state.options?.message).toContain('hay stock de 3 consumibles');
    expect(confirm.state.options?.message).toContain('seguir sacando stock');
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(false);
    await confirm.state.options!.accept();
    await flushPromises();
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true);
  });

  it('eliminar queda deshabilitado con el motivo cuando el registro está en uso', async () => {
    const { wrapper, fetchMock } = await mountSection(
      'statuses',
      [
        status({ name: 'En uso', inUse: true }),
        status({ id: '018f0000-0000-7000-8000-000000000009', name: 'Libre', inUse: false }),
      ],
      ['asset:read', 'catalog:write'],
    );
    expect(
      String(fetchMock.mock.calls.find((c) => String(c[0]).includes('status-labels'))![0]),
    ).toContain('withUsage=true');
    const inUse = wrapper.get('button[aria-label="Eliminar En uso"]');
    expect(inUse.attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('No se puede eliminar porque está en uso');
    expect(
      wrapper.get('button[aria-label="Eliminar Libre"]').attributes('disabled'),
    ).toBeUndefined();
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

  describe('cambio de sección [P30]', () => {
    const location = {
      id: '018f0000-0000-7000-8000-0000000000a1',
      name: 'Sala 1',
      path: 'Sala 1',
      type: 'warehouse',
      address: null,
      parent: null,
      active: true,
      updatedAt: '2026-11-16T12:00:00.000Z',
    };
    const category = {
      id: '018f0000-0000-7000-8000-0000000000b1',
      name: 'Notebooks',
      extension: 'none',
      scope: 'asset',
      active: true,
      updatedAt: '2026-11-16T12:00:00.000Z',
    };
    const model = {
      id: '018f0000-0000-7000-8000-0000000000c1',
      name: 'ThinkPad',
      modelNumber: null,
      manufacturer: { id: '018f0000-0000-7000-8000-0000000000d1', name: 'Lenovo' },
      category: { id: category.id, name: 'Notebooks', extension: 'none' },
      active: true,
      lorawanClass: null,
      lorawanRegion: null,
      lorawanVersion: null,
      lorawanRegionalParameters: null,
      updatedAt: '2026-11-16T12:00:00.000Z',
    };

    /** Responde al instante a `locations` y deja pendientes las demás hasta que el test las libere. */
    function slowFetch() {
      const pending: (() => void)[] = [];
      const bodies: Record<string, unknown[]> = {
        '/api/v1/locations': [location],
        '/api/v1/categories': [category],
        '/api/v1/models': [model],
      };
      const fn = vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input).split('?')[0]!;
        if (path === '/api/v1/auth/csrf') return jsonResponse({ token: 't' });
        const data = bodies[path] ?? [];
        if (path !== '/api/v1/locations') await new Promise<void>((r) => pending.push(r));
        return jsonResponse({ data, meta: { page: 1, pageSize: 25, total: data.length } });
      });
      vi.stubGlobal('fetch', fn);
      return { release: () => pending.splice(0).forEach((r) => r()) };
    }

    async function mountWithAuth(section: string) {
      const global = pagePlugins();
      useAuthStore(global.plugins![0] as never).user = {
        id: '018f0000-0000-7000-8000-0000000000ff',
        email: 'x@y.cl',
        name: 'X',
        mustChangePassword: false,
        roles: [],
        permissions: ['asset:read', 'catalog:write'],
      };
      await router.push(`/catalogo/${section}`);
      await router.isReady();
      const wrapper = mount(CatalogPage, { global });
      mounted.push(wrapper);
      await flushPromises();
      return wrapper;
    }

    it('al cambiar de sección no se muestran las filas de la anterior con las celdas de la nueva', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const net = slowFetch();
      const w = await mountWithAuth('locations');
      expect(w.text()).toContain('Sala 1');

      // Categorías y luego Modelos tardan en responder: mientras tanto no puede verse Sala 1 ni fallar el render.
      await router.push('/catalogo/categories');
      await flushPromises();
      expect(w.text()).not.toContain('Sala 1');
      await router.push('/catalogo/models');
      await flushPromises();
      expect(w.text()).not.toContain('Sala 1');

      net.release();
      await flushPromises();
      expect(w.text()).toContain('ThinkPad');
      expect(w.text()).toContain('Lenovo');

      await router.push('/catalogo/categories');
      await flushPromises();
      net.release();
      await flushPromises();
      expect(w.text()).toContain('Notebooks');
      expect(w.text()).not.toContain('ThinkPad');

      const logged = [...warn.mock.calls, ...error.mock.calls].map((c) => String(c[0]));
      expect(logged.filter((m) => /Not found|undefined|TypeError/.test(m))).toEqual([]);
      warn.mockRestore();
      error.mockRestore();
    });
  });

  it('el buscador tiene id y name [P31]', async () => {
    const { wrapper } = await mountSection('categories', [], ['asset:read']);
    const search = wrapper.get('input[type="search"]');
    expect(search.attributes('id')).toBe('catalog-search');
    expect(search.attributes('name')).toBe('q');
    const bare = wrapper
      .findAll('input, select, textarea')
      .filter((el) => !el.attributes('id') && !el.attributes('name'));
    expect(bare).toHaveLength(0);
  });
});

describe('secciones de consumibles (D4, D11)', () => {
  const unit = {
    id: '018f0000-0000-7000-8000-0000000000e1',
    name: 'litro',
    plural: 'litros',
    abbreviation: 'L',
    decimals: 3,
    active: true,
    updatedAt: '2026-11-16T12:00:00.000Z',
    inUse: false,
  };

  it('lista las unidades con plural, abreviatura y decimales, y quien gestiona consumibles puede editarlas', async () => {
    const { wrapper } = await mountSection(
      'units',
      [unit],
      ['consumables:read', 'consumables:manage'],
      {
        'GET /api/v1/measure-units': () => ({
          data: [unit],
          meta: { page: 1, pageSize: 25, total: 1 },
        }),
      },
    );
    expect(wrapper.text()).toContain('litros');
    expect(wrapper.text()).toContain('Nueva unidad de medida');
    expect(wrapper.find('button[aria-label="Editar litro"]').exists()).toBe(true);
  });

  it('un lector de consumibles ve las unidades sin botones de edición', async () => {
    const { wrapper } = await mountSection('units', [unit], ['consumables:read'], {
      'GET /api/v1/measure-units': () => ({
        data: [unit],
        meta: { page: 1, pageSize: 25, total: 1 },
      }),
    });
    expect(wrapper.text()).toContain('litros');
    expect(wrapper.text()).not.toContain('Nueva unidad de medida');
  });

  it('las secciones de activos no se ofrecen a quien solo ve consumibles', async () => {
    const { wrapper } = await mountSection(
      'consumableCategories',
      [
        {
          id: '018f0000-0000-7000-8000-0000000000e2',
          name: 'EPP',
          extension: 'none',
          scope: 'consumable',
          active: true,
          updatedAt: '2026-11-16T12:00:00.000Z',
        },
      ],
      ['consumables:read'],
      {
        'GET /api/v1/categories': () => ({
          data: [
            {
              id: '018f0000-0000-7000-8000-0000000000e2',
              name: 'EPP',
              extension: 'none',
              scope: 'consumable',
              active: true,
              updatedAt: '2026-11-16T12:00:00.000Z',
            },
          ],
          meta: { page: 1, pageSize: 25, total: 1 },
        }),
      },
    );
    const links = wrapper.findAll('nav a').map((a) => a.text());
    expect(links).toEqual(['Categorías de consumibles', 'Unidades de medida']);
    expect(wrapper.text()).toContain('EPP');
  });

  it('pide solo las categorías de su ámbito', async () => {
    const { fetchMock } = await mountSection('categories', [], ['asset:read']);
    const urls = fetchMock.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(urls.some((u: string) => u.includes('/categories?') && u.includes('scope=asset'))).toBe(
      true,
    );
  });
});
