import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { globalPlugins } from '@/test-utils';
import SearchSelect from './SearchSelect.vue';

const items = [
  { value: 'AU915', label: 'AU915 — Australia y Latinoamérica' },
  { value: 'EU868', label: 'EU868 — Europa' },
];
const mountIt = (modelValue: string) =>
  mount(SearchSelect, {
    props: { items, placeholder: 'Seleccione región', modelValue },
    global: globalPlugins(),
  });

describe('SearchSelect', () => {
  it('sin valor muestra el placeholder', () => {
    expect(mountIt('').text()).toContain('Seleccione región');
  });

  it('con valor muestra la etiqueta de la opción', () => {
    expect(mountIt('EU868').text()).toContain('EU868 — Europa');
  });
});
