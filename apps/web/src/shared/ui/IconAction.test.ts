import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { globalPlugins } from '@/test-utils';
import IconAction from './IconAction.vue';

const mountAction = (props: Record<string, unknown>) =>
  mount(IconAction, {
    props: { icon: 'i-lucide-pencil', label: 'Editar', ...props },
    global: globalPlugins(),
  });

describe('IconAction', () => {
  it('nombra el botón con la etiqueta y el objetivo, y emite click', async () => {
    const w = mountAction({ target: 'Acme' });
    const btn = w.get('button');
    expect(btn.attributes('aria-label')).toBe('Editar Acme');
    await btn.trigger('click');
    expect(w.emitted('click')).toHaveLength(1);
  });

  it('con motivo queda deshabilitado y lo expone a lectores de pantalla', () => {
    const w = mountAction({ label: 'Eliminar', disabledReason: 'Está en uso' });
    const btn = w.get('button');
    expect(btn.attributes('disabled')).toBeDefined();
    expect(w.get(`#${btn.attributes('aria-describedby')}`).text()).toBe('Está en uso');
  });
});
