import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import AssetHistory from './AssetHistory.vue';

afterEach(() => vi.unstubAllGlobals());

const ID = '018f0000-0000-7000-8000-000000000001';
const entry = (n: number, action: string, diff: Record<string, unknown> | null) => ({
  id: String(n),
  at: `2026-11-16T12:${String(n).padStart(2, '0')}:00.000Z`,
  actorId: null,
  actorName: 'Olga',
  actorLabel: null,
  action,
  entity: 'asset',
  entityId: ID,
  diff,
  ip: null,
});

function mountHistory(data: unknown[], total = data.length) {
  mockApi({
    [`GET /api/v1/assets/${ID}/history`]: () => ({ data, meta: { page: 1, pageSize: 10, total } }),
  });
  return mount(AssetHistory, { props: { assetId: ID }, global: pagePlugins() });
}

describe('AssetHistory (RF-24)', () => {
  it('muestra cada movimiento con quién, cuándo y los campos que cambiaron', async () => {
    const w = mountHistory([
      entry(3, 'asset.checkout', {
        before: { status: 'Disponible' },
        after: { status: 'Asignado', assignedTo: 'Tomás', note: 'sale a terreno' },
      }),
      entry(2, 'asset.update', {
        before: { name: 'A', serial: null },
        after: { name: 'B', serial: 'S1' },
      }),
      entry(1, 'asset.create', { after: { name: 'A' } }),
    ]);
    await flushPromises();
    const text = w.text();
    expect(text).toContain('Asignado a Tomás');
    expect(text).toContain('Datos modificados');
    expect(text).toContain('Activo creado');
    expect(text).toContain('por Olga');
    expect(text).toContain('Disponible');
    expect(text).toContain('sale a terreno');
    expect(text).toContain('(vacío)'); // serie: de nada a S1
    expect(w.findAll('ol > li')).toHaveLength(3);
  });

  it('muestra 10 movimientos y «Ver más» pide la página siguiente a la API', async () => {
    const all = Array.from({ length: 13 }, (_, i) =>
      entry(i + 1, 'asset.update', { after: { name: `N${i}` } }),
    );
    const fetchMock = mockApi({
      [`GET /api/v1/assets/${ID}/history`]: (_init, url) => {
        const page = Number(new URL(url, 'http://x').searchParams.get('page'));
        return {
          data: all.slice((page - 1) * 10, page * 10),
          meta: { page, pageSize: 10, total: 13 },
        };
      },
    });
    const w = mount(AssetHistory, { props: { assetId: ID }, global: pagePlugins() });
    await flushPromises();
    expect(w.findAll('ol > li')).toHaveLength(10);
    const more = w.findAll('button').find((b) => b.text() === 'Ver más')!;
    await more.trigger('click');
    await flushPromises();
    expect(w.findAll('ol > li')).toHaveLength(13);
    expect(w.findAll('button').some((b) => b.text() === 'Ver más')).toBe(false);
    expect(
      fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('history')),
    ).toEqual([
      expect.stringContaining('page=1&pageSize=10'),
      expect.stringContaining('page=2&pageSize=10'),
    ]);
    expect(w.find('[class*="overflow-y"]').exists()).toBe(false); // sin scroll interno
  });

  it('estado vacío', async () => {
    const w = mountHistory([]);
    await flushPromises();
    expect(w.text()).toContain('Sin movimientos todavía');
  });

  it('error con mensaje accesible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 500)));
    const w = mount(AssetHistory, { props: { assetId: ID }, global: pagePlugins() });
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Algo salió mal');
  });

  it('con más de una página ofrece paginación', async () => {
    const w = mountHistory([entry(1, 'asset.create', null)], 35);
    await flushPromises();
    expect(w.findAll('button').length).toBeGreaterThan(0);
  });
});
