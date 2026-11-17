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
  const more = (w: VueWrapper) => w.get('#asset-more-filters');
  const toggle = (w: VueWrapper) => w.findAll('button').find((b) => b.text() === 'Más filtros')!;

  it('a la vista van Estado, Categoría y Ubicación base; el resto queda tras «Más filtros»', () => {
    const w = mountFilters();
    const visible = w.get('div.grid').text();
    for (const label of ['Estado', 'Categoría', 'Ubicación base']) expect(visible).toContain(label);
    expect(more(w).isVisible()).toBe(false);
    expect(toggle(w).attributes('aria-expanded')).toBe('false');
    for (const label of ['Modelo', 'Ubicación', 'Asignado a', 'Dados de baja']) {
      expect(more(w).text()).toContain(label);
    }
  });

  it('«Más filtros» abre y cierra el resto', async () => {
    const w = mountFilters();
    await toggle(w).trigger('click');
    expect(more(w).isVisible()).toBe(true);
    expect(toggle(w).attributes('aria-expanded')).toBe('true');
    await toggle(w).trigger('click');
    expect(more(w).isVisible()).toBe(false);
  });

  it.each([
    ['modelId', { modelId: STATUS }],
    ['statusKind', { statusKind: 'deployable' }],
    ['assigned', { assigned: 'no' }],
    ['overdue', { overdue: 'true' }],
    ['deleted', { deleted: 'include' }],
  ])('se abre solo si hay un filtro de «Más filtros» activo (%s)', (_name, patch) => {
    const w = mountFilters(patch);
    expect(more(w).isVisible()).toBe(true);
  });

  it('un filtro visible activo no abre «Más filtros»', () => {
    const w = mountFilters({ statusId: STATUS });
    expect(more(w).isVisible()).toBe(false);
  });

  it('el filtro por grupo de estados se lee en español, sin jerga', () => {
    const w = mountFilters({ statusKind: 'deployable' });
    expect(w.get('#filter-status-kind').text()).toBe('Estados asignables');
    expect(w.text()).not.toMatch(/desplegable/i);
  });

  it('sin filtros activos «Limpiar filtros» está deshabilitado', () => {
    const clear = mountFilters()
      .findAll('button')
      .find((b) => b.text().includes('Limpiar filtros'))!;
    expect(clear.attributes('disabled')).toBeDefined();
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
