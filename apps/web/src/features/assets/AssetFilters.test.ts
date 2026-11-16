import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, pagePlugins } from '@/test-utils';
import { ASSET_LIST_DEFAULTS } from './api';
import AssetFilters from './AssetFilters.vue';

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

const STATUS = '018f0000-0000-7000-8000-0000000000c1';

function mountFilters(state: Partial<typeof ASSET_LIST_DEFAULTS> = {}) {
  mockApi({
    [`GET /api/v1/status-labels/${STATUS}`]: () => ({
      id: STATUS,
      name: 'En reparación',
      kind: 'undeployable',
      active: true,
      isSystem: false,
      updatedAt: '2026-11-16T12:00:00.000Z',
    }),
  });
  const w = mount(AssetFilters, {
    props: { state: { ...ASSET_LIST_DEFAULTS, ...state } },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  return w;
}

describe('AssetFilters (RF-22)', () => {
  it('ofrece los seis filtros con su rótulo', () => {
    const text = mountFilters().text();
    for (const label of [
      'Estado',
      'Categoría',
      'Modelo',
      'Ubicación',
      'Asignado a',
      'Dados de baja',
    ]) {
      expect(text).toContain(label);
    }
  });

  it('sin filtros activos no ofrece limpiar', () => {
    expect(mountFilters().text()).not.toContain('Limpiar filtros');
  });

  it('con un filtro de la URL muestra su nombre y permite limpiar', async () => {
    const w = mountFilters({ statusId: STATUS });
    await flushPromises();
    expect(w.text()).toContain('En reparación');
    const clear = w.findAll('button').find((b) => b.text().includes('Limpiar filtros'))!;
    await clear.trigger('click');
    expect(w.emitted('clear')).toHaveLength(1);
  });

  it('no emite cambios al montar: abrir un enlace compartido no debe reiniciar la página', async () => {
    const w = mountFilters({ statusId: STATUS, page: 3 });
    await flushPromises();
    expect(w.emitted('change')).toBeUndefined();
  });
});
