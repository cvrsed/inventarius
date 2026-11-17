import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import AssetFormPage from './AssetFormPage.vue';

const uuid = (n: number) => `018f0000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const ID = uuid(1);

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

const existing = {
  id: ID,
  assetTag: 'INV-000001',
  name: 'Notebook de Ana',
  serial: 'SN-1',
  model: { id: uuid(2), name: 'ThinkPad' },
  manufacturer: { id: uuid(3), name: 'Lenovo' },
  category: { id: uuid(4), name: 'Notebooks', extension: 'none' },
  status: { id: uuid(5), name: 'Disponible', kind: 'deployable' },
  location: { id: uuid(6), name: 'Sala 1' },
  assignedUser: null,
  assignedLocation: null,
  deleted: false,
  purchaseDate: '2026-01-31',
  purchaseCost: 1500,
  purchaseCurrency: 'CLP',
  supplier: null,
  warrantyMonths: 12,
  warrantyEndsOn: '2027-01-31',
  notes: null,
  assignment: null,
  deletedAt: null,
  deleteReason: null,
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
};

async function mountAt(url: string, routes: Parameters<typeof mockApi>[0] = {}) {
  const fetchMock = mockApi({ [`GET /api/v1/assets/${ID}`]: () => existing, ...routes });
  await router.push(url);
  await router.isReady();
  const w = mount(AssetFormPage, { global: pagePlugins() });
  mounted.push(w);
  await flushPromises();
  return { w, fetchMock };
}
const type = async (w: VueWrapper, selector: string, value: string) => {
  await w.get(selector).setValue(value);
  await flushPromises();
};

describe('AssetFormPage (RF-20)', () => {
  it('el alta exige nombre, modelo y estado', async () => {
    const { w, fetchMock } = await mountAt('/activos/nuevo');
    expect(w.get('h1').text()).toBe('Nuevo activo');
    expect(w.text()).toContain('Déjala vacía para generarla automáticamente');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.findAll('[id$="-error"], .text-error').length).toBeGreaterThanOrEqual(3);
    expect(w.text()).toContain('Este campo es obligatorio');
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });

  it('el alta no pide ningún activo (no hay id): un GET vacío retrasaba los avisos por sus reintentos', async () => {
    const { fetchMock } = await mountAt('/activos/nuevo');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => /\/api\/v1\/assets\/?(\?|$)/.test(u))).toEqual([]);
  });

  it('la edición carga el activo y manda solo lo necesario con If-Match', async () => {
    const { w, fetchMock } = await mountAt(`/activos/${ID}/editar`, {
      [`PATCH /api/v1/assets/${ID}`]: () => ({ ...existing, name: 'Notebook v2' }),
    });
    expect(w.get('h1').text()).toBe('Editar activo');
    expect((w.get('#a-name').element as HTMLInputElement).value).toBe('Notebook de Ana');
    expect((w.get('#a-tag').element as HTMLInputElement).value).toBe('INV-000001');
    expect((w.get('#a-cost').element as HTMLInputElement).value).toBe('1500');

    await type(w, '#a-name', 'Notebook v2');
    await w.get('form').trigger('submit');
    await flushPromises();
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect((call[1]!.headers as Record<string, string>)['if-match']).toBe(
      `"${existing.updatedAt}"`,
    );
    const sent = JSON.parse(String(call[1]!.body));
    expect(sent).toMatchObject({ name: 'Notebook v2', assetTag: 'INV-000001', purchaseCost: 1500 });
    expect(sent).not.toHaveProperty('statusId'); // el estado no cambió
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('asset'));
  });

  it('una etiqueta repetida muestra el error junto al campo', async () => {
    const { w } = await mountAt(`/activos/${ID}/editar`, {
      [`PATCH /api/v1/assets/${ID}`]: () =>
        jsonResponse(
          {
            type: 'https://inventarius.local/problems/conflict',
            title: 'Conflicto',
            status: 409,
            detail: 'Ya existe un activo con esa etiqueta',
          },
          409,
        ),
    });
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('Ya existe un activo con esa etiqueta');
  });

  it('un activo asignado no deja cambiar el estado desde el formulario', async () => {
    const { w } = await mountAt(`/activos/${ID}/editar`, {
      [`GET /api/v1/assets/${ID}`]: () => ({
        ...existing,
        assignedUser: { id: uuid(9), name: 'Tomás' },
        status: { id: uuid(7), name: 'Asignado', kind: 'deployable' },
      }),
    });
    expect(w.text()).toContain('Está asignado: devuélvelo para cambiar su estado');
    expect(w.get('#a-status').attributes('disabled')).toBeDefined();
  });

  it('un activo inexistente muestra el aviso', async () => {
    const { w } = await mountAt(`/activos/${ID}/editar`, {
      [`GET /api/v1/assets/${ID}`]: () => jsonResponse({}, 404),
    });
    expect(w.text()).toContain('No encontramos este activo');
  });
});
