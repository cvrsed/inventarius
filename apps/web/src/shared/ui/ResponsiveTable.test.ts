import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { globalPlugins, useMobileViewport } from '@/test-utils';
import ResponsiveTable from './ResponsiveTable.vue';

const rows = [
  { id: 'a', name: 'Alfa' },
  { id: 'b', name: 'Beta' },
];
const mountIt = (data: typeof rows) =>
  mount(ResponsiveTable<(typeof rows)[number]>, {
    props: {
      data,
      columns: [{ id: 'name', header: 'Nombre' }],
      getRowId: (r: { id: string }) => r.id,
    },
    slots: {
      'name-cell': `<template #name-cell="{ row }">T:{{ row.original.name }}</template>`,
      card: `<template #card="{ item }"><b>C:{{ item.name }}</b><button>Editar {{ item.name }}</button></template>`,
      empty: 'Sin datos',
    },
    global: globalPlugins(),
  });

describe('ResponsiveTable', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('en escritorio renderiza solo la tabla', () => {
    const w = mountIt(rows);
    expect(w.get('table').text()).toContain('T:Alfa');
    expect(w.find('ul').exists()).toBe(false);
  });

  it('en móvil renderiza solo una tarjeta por fila, con sus acciones y sin scroll horizontal', () => {
    useMobileViewport();
    const w = mountIt(rows);
    expect(w.find('table').exists()).toBe(false);
    const cards = w.findAll('ul > li');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain('C:Alfa');
    expect(cards[1]!.find('button').text()).toBe('Editar Beta');
    expect(w.get('ul').classes().join(' ')).not.toContain('overflow-x');
  });

  it('sin filas muestra el estado vacío en las tarjetas', () => {
    useMobileViewport();
    expect(mountIt([]).get('ul').text()).toContain('Sin datos');
  });
});
