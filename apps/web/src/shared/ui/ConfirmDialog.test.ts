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
});
