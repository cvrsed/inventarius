import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, pagePlugins } from '@/test-utils';
import AssetBatchPage from './AssetBatchPage.vue';

afterEach(() => vi.unstubAllGlobals());

const seed = {
  id: '018f0000-0000-7000-8000-000000000009',
  name: 'Pendiente de configuración',
  kind: 'pending',
  active: true,
  isSystem: false,
  updatedAt: '2026-11-16T12:00:00.000Z',
};

function mountPage() {
  const fetchMock = mockApi({
    'GET /api/v1/status-labels': () => ({
      data: [seed],
      meta: { page: 1, pageSize: 30, total: 1 },
    }),
  });
  const w = mount(AssetBatchPage, { global: pagePlugins() });
  return { w, fetchMock };
}

describe('AssetBatchPage (RF-27)', () => {
  it('parte con el estado «Pendiente de configuración»', async () => {
    const { w } = mountPage();
    await flushPromises();
    expect(w.get('#b-status').text()).toContain('Pendiente de configuración');
  });

  it('sin datos pide modelo, bodega y cantidad válida y no envía', async () => {
    const { w, fetchMock } = mountPage();
    await flushPromises();
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('Este campo es obligatorio');
    expect(w.text()).toContain('Escribe un número entero de 1 a 500');
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });

  it('cuenta las series y avisa si no coinciden con la cantidad', async () => {
    const { w } = mountPage();
    await flushPromises();
    await w.get('#b-quantity').setValue('3');
    await w.get('#b-serials').setValue('A1\nA2\n');
    expect(w.text()).toContain('Llevas 2');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(w.text()).toContain('La cantidad de series debe coincidir');
  });
});
