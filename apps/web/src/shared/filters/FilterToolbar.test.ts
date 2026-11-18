import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, pagePlugins, useMobileViewport } from '@/test-utils';
import FilterToolbar from './FilterToolbar.vue';
import type { FilterDef } from './types';

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const STATUS = '018f0000-0000-7000-8000-0000000000c1';
const defs: FilterDef[] = [
  {
    kind: 'remote',
    key: 'statusId',
    label: 'Estado',
    placement: 'bar',
    source: 'statuses',
    fetcher: async () => [{ id: STATUS, name: 'Disponible' }],
    resolve: async (id) => (id === STATUS ? { id, name: 'Disponible' } : null),
  },
  {
    kind: 'choice',
    key: 'assigned',
    label: 'Asignación',
    placement: 'bar',
    options: [
      { value: 'yes', label: 'Asignados' },
      { value: 'no', label: 'Sin asignar' },
    ],
  },
  { kind: 'date', key: 'from', label: 'Desde', placement: 'more' },
  {
    kind: 'choice',
    key: 'deleted',
    label: 'Dados de baja',
    placement: 'more',
    defaultValue: 'exclude',
    options: [
      { value: 'exclude', label: 'No mostrar' },
      { value: 'include', label: 'Incluir' },
    ],
  },
];

function mountBar(values: Record<string, string> = {}, total: number | undefined = 12) {
  mockApi({});
  const w = mount(FilterToolbar, {
    props: {
      defs,
      values: { statusId: '', assigned: '', from: '', deleted: 'exclude', ...values },
      search: '',
      searchId: 'x-search',
      searchPlaceholder: 'Buscar',
      total,
    },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  return w;
}
const buttons = (w: ReturnType<typeof mountBar>) => w.findAll('button').map((b) => b.text());

describe('FilterToolbar [P41]', () => {
  it('escritorio: buscador + botones compactos de la barra + «Filtros», sin etiquetas encima', () => {
    const w = mountBar();
    expect(w.find('input[type="search"]').attributes('name')).toBe('q');
    const labels = buttons(w);
    expect(labels).toEqual(expect.arrayContaining(['Estado', 'Asignación', 'Filtros']));
    expect(w.findAll('label')).toHaveLength(0);
    expect(w.text()).toContain('12 resultados');
  });

  it('sin filtros activos no hay chips ni «Limpiar todo»', () => {
    const w = mountBar();
    expect(w.findAll('[data-filter-chip]')).toHaveLength(0);
    expect(buttons(w)).not.toContain('Limpiar todo');
  });

  it('los filtros activos son chips removibles con nombre accesible; «Limpiar todo» aparece', async () => {
    const w = mountBar({ statusId: STATUS, assigned: 'no' });
    await flushPromises();
    const chips = w.findAll('[data-filter-chip]').map((c) => c.text());
    expect(chips).toEqual(['Estado: Disponible', 'Asignación: Sin asignar']);
    const remove = w.get('button[aria-label="Quitar filtro Estado: Disponible"]');
    await remove.trigger('click');
    expect(w.emitted('change')).toEqual([[{ statusId: '' }]]);
    const clear = w.findAll('button').find((b) => b.text() === 'Limpiar todo')!;
    await clear.trigger('click');
    expect(w.emitted('clear')).toHaveLength(1);
  });

  it('un filtro con valor por defecto distinto de vacío solo es chip si se aparta de él', async () => {
    expect(mountBar({ deleted: 'exclude' }).findAll('[data-filter-chip]')).toHaveLength(0);
    const w = mountBar({ deleted: 'include' });
    await flushPromises();
    expect(w.findAll('[data-filter-chip]').map((c) => c.text())).toEqual([
      'Dados de baja: Incluir',
    ]);
  });

  it('«Filtros» marca cuántos de sus filtros están activos', () => {
    const w = mountBar({ deleted: 'include', from: '2026-11-01' });
    const more = w.get('#filters-more');
    expect(more.text()).toContain('2');
  });

  it('móvil: buscador + «Filtros (n)» y un panel inferior con todos los filtros y «Ver N resultados»', async () => {
    useMobileViewport();
    const w = mountBar({ assigned: 'yes' }, 7);
    await flushPromises();
    const open = w.get('#filters-panel-button');
    expect(open.text()).toBe('Filtros (1)');
    expect(w.find('#filters-more').exists()).toBe(false);
    await open.trigger('click');
    await flushPromises();
    const panel = document.body.querySelector('[role="dialog"]')!;
    expect(panel).toBeTruthy();
    // Todos los filtros, también los de «+ Filtros», con su etiqueta.
    for (const label of ['Estado', 'Asignación', 'Desde', 'Dados de baja']) {
      expect(panel.textContent).toContain(label);
    }
    const show = [...panel.querySelectorAll('button')].find((b) =>
      /Ver 7 resultados/.test(b.textContent ?? ''),
    )!;
    expect(show).toBeTruthy();
    show.click();
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
