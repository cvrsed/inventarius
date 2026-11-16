import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pagePlugins } from '@/test-utils';
import TempPasswordDialog from './TempPasswordDialog.vue';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function open() {
  return mount(TempPasswordDialog, {
    props: { visible: true, password: 'Temporal-Clave-2026' },
    global: pagePlugins(),
    attachTo: document.body,
  });
}

describe('TempPasswordDialog', () => {
  it('muestra la contraseña temporal solo lectura y permite copiarla', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const w = open();
    await flushPromises();
    const input = document.body.querySelector('input[readonly]') as HTMLInputElement;
    expect(input.value).toBe('Temporal-Clave-2026');
    (document.body.querySelector('button[aria-label="Copiar"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith('Temporal-Clave-2026');
    expect(document.body.textContent).toContain('Copiada');
    w.unmount();
  });

  it('si el portapapeles no está disponible no rompe ni dice «copiada»', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denegado')) },
    });
    const w = open();
    await flushPromises();
    (document.body.querySelector('button[aria-label="Copiar"]') as HTMLButtonElement).click();
    await flushPromises();
    expect(document.body.textContent).not.toContain('Copiada');
    w.unmount();
  });
});
