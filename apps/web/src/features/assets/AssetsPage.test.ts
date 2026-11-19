import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { mockApi, pagePlugins } from '@/test-utils';
import AssetsPage from './AssetsPage.vue';

/** Los componentes montados se desmontan: comparten router y no deben seguir reaccionando a otros tests. */
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

const asset = (n: number, over: Record<string, unknown> = {}) => ({
  id: `018f0000-0000-7000-8000-00000000000${n}`,
  assetTag: `INV-00000${n}`,
  name: `Sensor ${n}`,
  serial: null,
  model: { id: '018f0000-0000-7000-8000-0000000000a1', name: 'Modelo A' },
  category: { id: '018f0000-0000-7000-8000-0000000000b1', name: 'Sensores', extension: 'none' },
  status: { id: '018f0000-0000-7000-8000-0000000000c1', name: 'Disponible', kind: 'deployable' },
  baseLocation: null,
  location: n === 1 ? { id: '018f0000-0000-7000-8000-0000000000d1', name: 'Sala 1' } : null,
  assignedUser: n === 2 ? { id: '018f0000-0000-7000-8000-0000000000e1', name: 'Olga' } : null,
  assignedLocation: null,
  deleted: false,
  devEui: null,
  lnsStatus: null,
  updatedAt: '2026-11-16T12:00:00.000Z',
  ...over,
});

const page = (data: unknown[], total = data.length) => ({
  data,
  meta: { page: 1, pageSize: 25, total },
});

async function mountAt(url: string, data: unknown[], total?: number) {
  const fetchMock = mockApi({ 'GET /api/v1/assets': () => page(data, total) });
  await router.push(url);
  await router.isReady();
  const wrapper = mount(AssetsPage, { global: pagePlugins() });
  mounted.push(wrapper);
  await flushPromises();
  return { wrapper, fetchMock };
}

const listCalls = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith('/api/v1/assets?'));

describe('AssetsPage (RF-22, RF-40)', () => {
  it('muestra los activos en tabla (escritorio) y en tarjetas (móvil) con su estado', async () => {
    const { wrapper } = await mountAt('/activos', [asset(1), asset(2)]);
    expect(wrapper.text()).toContain('INV-000001');
    expect(wrapper.text()).toContain('Sensor 2');
    expect(wrapper.text()).toContain('Olga');
    expect(wrapper.text()).toContain('2 resultados');
    const cards = wrapper.findAll('ul a[href^="/activos/"]');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.attributes('href')).toBe('/activos/018f0000-0000-7000-8000-000000000001');
  });

  it('los filtros de la URL viajan a la API y la página los refleja', async () => {
    const statusId = '018f0000-0000-7000-8000-0000000000c1';
    const { fetchMock } = await mountAt(
      `/activos?q=sensor&statusId=${statusId}&sort=-name&page=2&pageSize=50&deleted=only`,
      [],
    );
    const url = listCalls(fetchMock).at(-1)!;
    const params = new URL(url, 'http://x').searchParams;
    expect(Object.fromEntries(params)).toEqual({
      page: '2',
      pageSize: '50',
      q: 'sensor',
      sort: '-name',
      statusId,
      deleted: 'only',
    });
  });

  it('los filtros del Inicio (tipo de estado, asignación, atraso) viajan a la API y abren el panel', async () => {
    const { wrapper, fetchMock } = await mountAt(
      '/activos?statusKind=pending&assigned=no&overdue=true&baseLocationId=018f0000-0000-7000-8000-0000000000d1',
      [],
    );
    const params = new URL(listCalls(fetchMock).at(-1)!, 'http://x').searchParams;
    expect(Object.fromEntries(params)).toMatchObject({
      statusKind: 'pending',
      assigned: 'no',
      overdue: 'true',
      baseLocationId: '018f0000-0000-7000-8000-0000000000d1',
    });
    // Cada filtro activo se ve como chip legible (sin jerga de tipos) con su nombre accesible.
    const chips = wrapper.findAll('[data-filter-chip]').map((c) => c.text());
    expect(chips).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Grupo de estados: Estados pendientes'),
        expect.stringContaining('Asignación: Sin asignar'),
        expect.stringContaining('Devolución: Atrasada'),
      ]),
    );
    expect(
      wrapper.find('button[aria-label="Quitar filtro Asignación: Sin asignar"]').exists(),
    ).toBe(true);
    expect(wrapper.text()).toContain('Limpiar todo');
  });

  it('sin filtros la API recibe solo página y tamaño', async () => {
    const { fetchMock } = await mountAt('/activos', []);
    const params = new URL(listCalls(fetchMock).at(-1)!, 'http://x').searchParams;
    expect([...params.keys()].sort()).toEqual(['page', 'pageSize', 'sort']);
  });

  it('escribir en la búsqueda actualiza la URL y vuelve a la página 1', async () => {
    vi.useFakeTimers();
    try {
      const { wrapper } = await mountAt('/activos?page=3', [asset(1)], 80);
      await wrapper.get('input[type="search"]').setValue('router');
      await vi.advanceTimersByTimeAsync(400);
      await flushPromises();
      expect(router.currentRoute.value.query).toEqual({ q: 'router' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('estado vacío sin filtros y con filtros', async () => {
    expect((await mountAt('/activos', [])).wrapper.text()).toContain('Aún no hay activos');
    expect((await mountAt('/activos?q=zzz', [])).wrapper.text()).toContain(
      'No hay resultados para esta búsqueda',
    );
  });

  it('el enlace de exportación lleva los mismos filtros, sin paginación', async () => {
    const { wrapper } = await mountAt('/activos?q=sensor&page=4', [asset(1)], 100);
    const link = wrapper.findAll('a').find((a) => a.text().includes('Exportar CSV'))!;
    expect(link.attributes('href')).toBe('/api/v1/assets/export?q=sensor&sort=assetTag');
  });

  it('marca los activos dados de baja', async () => {
    const { wrapper } = await mountAt('/activos?deleted=include', [asset(1, { deleted: true })]);
    expect(wrapper.text()).toContain('Dado de baja');
  });

  describe('orden del listado [P27]', () => {
    const header = (w: { find: (s: string) => { element: Element } }, id: string) =>
      (w.find(`[data-sort-column="${id}"]`) as unknown as { element: HTMLElement }).element;

    it('en escritorio los encabezados ordenan, con aria-sort y flecha, y no hay select con ↑/↓', async () => {
      const { wrapper } = await mountAt('/activos?sort=name', [asset(1)]);
      const ths = wrapper.findAll('th');
      const byName = (n: string) => ths.find((th) => th.text().includes(n))!;
      expect(byName('Nombre').attributes('aria-sort')).toBe('ascending');
      expect(byName('Etiqueta').attributes('aria-sort')).toBe('none');
      expect(byName('Asignado a').attributes('aria-sort')).toBeUndefined();
      expect(
        wrapper.find('[data-sort-column="name"] svg, [data-sort-column="name"] span').exists(),
      ).toBe(true);
      expect(wrapper.text()).not.toMatch(/[↑↓]/);
      expect(header(wrapper, 'name').tagName).toBe('BUTTON');
    });

    it('un clic ordena ascendente y otro clic en la misma columna, descendente', async () => {
      const { wrapper } = await mountAt('/activos', [asset(1)]);
      header(wrapper, 'model').click();
      await flushPromises();
      expect(router.currentRoute.value.query['sort']).toBe('model');
      header(wrapper, 'model').click();
      await flushPromises();
      expect(router.currentRoute.value.query['sort']).toBe('-model');
      expect(
        wrapper
          .findAll('th')
          .find((th) => th.text().includes('Modelo'))!
          .attributes('aria-sort'),
      ).toBe('descending');
    });

    it('en móvil hay «Ordenar por» (campo) y un botón de dirección separado', async () => {
      const { wrapper } = await mountAt('/activos?sort=-name', [asset(1)]);
      expect(wrapper.find('[aria-label="Ordenar por"]').exists()).toBe(true);
      const dir = wrapper.get('button[aria-label^="Orden descendente"]');
      await dir.trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.query['sort']).toBe('name');
      expect(wrapper.find('button[aria-label^="Orden ascendente"]').exists()).toBe(true);
    });
  });

  it('el buscador tiene id y name (autocompletado y accesibilidad) [P31]', async () => {
    const { wrapper } = await mountAt('/activos', [asset(1)]);
    const search = wrapper.get('input[type="search"]');
    expect(search.attributes('id')).toBe('assets-search');
    expect(search.attributes('name')).toBe('q');
    const bare = wrapper
      .findAll('input, select, textarea')
      .filter((el) => !el.attributes('id') && !el.attributes('name'));
    expect(bare).toHaveLength(0);
  });
});
