import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReasonButton from './ReasonButton.vue';

describe('ReasonButton', () => {
  it('sin motivo es un botón normal, con su color', async () => {
    const w = mount(ReasonButton, { props: { label: 'Importar' }, attrs: { color: 'primary' } });
    const b = w.get('button');
    expect(b.attributes('disabled')).toBeUndefined();
    expect(b.classes().join(' ')).toMatch(/primary/);
    await b.trigger('click');
    expect(w.emitted('click')).toHaveLength(1);
  });

  it('con motivo queda desactivado, neutro (sin primario) y explica por qué', async () => {
    const w = mount(ReasonButton, {
      props: { label: 'Importar', reason: 'Corrige los errores' },
      attrs: { color: 'primary' },
    });
    const b = w.get('button');
    expect(b.attributes('disabled')).toBeDefined();
    expect(b.classes().join(' ')).not.toMatch(/primary/);
    const id = b.attributes('aria-describedby')!;
    expect(w.get(`#${CSS.escape(id)}`).text()).toBe('Corrige los errores');
    await b.trigger('click');
    expect(w.emitted('click')).toBeUndefined();
  });
});
