import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { pagePlugins } from '@/test-utils';
import AppSelect from './AppSelect.vue';

afterEach(() => {
  document.body.innerHTML = '';
});

const items = [
  { value: '', label: 'Todas' },
  { value: 'user', label: 'Usuario' },
];

describe('AppSelect', () => {
  it('muestra «Todas» para el valor vacío (reka-ui no admite opciones vacías)', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const w = mount(AppSelect, {
      props: { modelValue: '', items },
      global: pagePlugins(),
      attachTo: document.body,
    });
    await flushPromises();
    expect(w.text()).toContain('Todas');
    w.unmount();
  });

  it('deja el fondo inerte mientras el listbox está abierto y lo restaura al cerrar o desmontar', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById('app')!;
    const w = mount(AppSelect, {
      props: { modelValue: 'user', items },
      global: pagePlugins(),
      attachTo: document.body,
    });
    const select = w.findComponent({ name: 'Select' });
    select.vm.$emit('update:open', true);
    expect(root.hasAttribute('inert')).toBe(true);
    select.vm.$emit('update:open', false);
    expect(root.hasAttribute('inert')).toBe(false);
    select.vm.$emit('update:open', true);
    w.unmount();
    expect(root.hasAttribute('inert')).toBe(false);
  });
});
