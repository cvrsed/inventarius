import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pagePlugins } from '@/test-utils';
import ConfirmDialog from './ConfirmDialog.vue';
import { useConfirm } from './useConfirm';

afterEach(() => {
  useConfirm().close();
  document.body.innerHTML = '';
});

function request(accept = vi.fn(), danger = false) {
  useConfirm().require({
    title: 'Eliminar',
    message: '¿Seguro?',
    acceptLabel: 'Sí, eliminar',
    rejectLabel: 'Cancelar',
    danger,
    accept,
  });
  return accept;
}

describe('ConfirmDialog', () => {
  it('muestra el título y el mensaje y ejecuta la acción al confirmar', async () => {
    const w = mount(ConfirmDialog, { global: pagePlugins(), attachTo: document.body });
    const accept = request();
    await flushPromises();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Eliminar');
    expect(dialog.textContent).toContain('¿Seguro?');
    const confirmButton = [...dialog.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Sí, eliminar'),
    )!;
    confirmButton.click();
    await flushPromises();
    expect(accept).toHaveBeenCalledOnce();
    expect(useConfirm().state.open).toBe(false);
    w.unmount();
  });

  it('cancelar cierra sin ejecutar la acción', async () => {
    const w = mount(ConfirmDialog, { global: pagePlugins(), attachTo: document.body });
    const accept = request(vi.fn(), true);
    await flushPromises();
    const cancel = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Cancelar',
    )!;
    cancel.click();
    await flushPromises();
    expect(accept).not.toHaveBeenCalled();
    expect(useConfirm().state.open).toBe(false);
    w.unmount();
  });

  it('con filas muestra etiqueta y dato, destaca el dato clave y cierra con la nota (D6)', async () => {
    const w = mount(ConfirmDialog, { global: pagePlugins(), attachTo: document.body });
    useConfirm().require({
      title: 'Confirmar ajuste',
      message: 'Revisa el ajuste antes de confirmar.',
      rows: [
        { label: 'Bodega', value: 'Bodega central' },
        { label: 'Saldo', value: '35 → 34', highlight: true },
      ],
      bullets: ['No admite ingresos'],
      footnote: 'Queda en el libro.',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Volver',
      accept: vi.fn(),
    });
    await flushPromises();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const terms = [...dialog.querySelectorAll('dt')].map((d) => d.textContent?.trim());
    expect(terms).toEqual(['Bodega', 'Saldo']);
    const highlighted = dialog.querySelectorAll('[data-highlight="true"]');
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0]!.textContent?.trim()).toBe('35 → 34');
    expect(dialog.querySelector('li')?.textContent).toBe('No admite ingresos');
    expect(dialog.textContent).toContain('Queda en el libro.');
    w.unmount();
  });
});
