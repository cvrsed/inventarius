import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { globalPlugins } from '@/test-utils';
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
  it('renderiza la tabla (escritorio) y una tarjeta por fila (móvil) con sus acciones', () => {
    const w = mountIt(rows);
    expect(w.get('table').text()).toContain('T:Alfa');
    const cards = w.findAll('ul > li');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.text()).toContain('C:Alfa');
    expect(cards[1]!.find('button').text()).toBe('Editar Beta');
  });

  it('las tarjetas no generan scroll horizontal y la tabla solo se muestra desde md', () => {
    const w = mountIt(rows);
    expect(w.get('div.hidden').classes()).toContain('md:block');
    expect(w.get('ul').classes()).toContain('md:hidden');
    expect(w.get('ul').classes().join(' ')).not.toContain('overflow-x');
  });

  it('sin filas muestra el estado vacío en las tarjetas', () => {
    expect(mountIt([]).get('ul').text()).toContain('Sin datos');
  });
});
