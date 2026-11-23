import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { mockApi, pagePlugins } from '@/test-utils';
import FilterChip from './FilterChip.vue';
import type { FilterDef } from './types';

const ID = '018f0000-0000-7000-8000-0000000000c1';
const def = (extra: Partial<FilterDef> = {}): FilterDef =>
  ({
    kind: 'remote',
    key: 'locationId',
    label: 'Ubicación actual',
    placement: 'bar',
    source: 'locations',
    fetcher: async () => [],
    resolve: async (id: string) => ({ id, name: 'Chile' }),
    ...extra,
  }) as FilterDef;

const mounted: { unmount: () => void }[] = [];
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()));

async function chip(d: FilterDef) {
  mockApi({});
  const w = mount(FilterChip, { props: { def: d, value: ID }, global: pagePlugins() });
  mounted.push(w);
  await new Promise((r) => setTimeout(r, 0));
  await w.vm.$nextTick();
  return w;
}

describe('chip de un filtro (U5)', () => {
  it('con aviso, lo agrega tras el valor: «Ubicación actual: Chile (incluye sububicaciones)»', async () => {
    const w = await chip(def({ valueNote: 'incluye sububicaciones' }));
    expect(w.text()).toBe('Ubicación actual: Chile (incluye sububicaciones)');
    expect(w.get('button').attributes('aria-label')).toBe(
      'Quitar filtro Ubicación actual: Chile (incluye sububicaciones)',
    );
  });

  it('sin aviso, muestra solo «Etiqueta: valor»', async () => {
    const w = await chip(def({ label: 'Bodega base' }));
    expect(w.text()).toBe('Bodega base: Chile');
  });
});
