import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetDto } from '@inventarius/shared';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import CheckoutDialog from './CheckoutDialog.vue';

const asset = {
  id: '018f0000-0000-7000-8000-000000000001',
  name: 'Notebook',
  updatedAt: '2026-11-16T12:00:00.000Z',
} as unknown as AssetDto;

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function open() {
  const w = mount(CheckoutDialog, {
    props: { asset, visible: false },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await w.setProps({ visible: true });
  await flushPromises();
  return w;
}
const submit = async () => {
  document.body.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  await flushPromises();
};

describe('CheckoutDialog (RF-23)', () => {
  it('no envía sin destino y pide elegirlo', async () => {
    const fetchMock = mockApi({});
    await open();
    await submit();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('checkout'))).toBe(false);
  });

  it('ofrece asignar a una persona o a una ubicación', async () => {
    await open();
    expect(document.body.textContent).toContain('Asignar activo');
    expect(document.body.textContent).toContain('Persona');
    expect(document.body.querySelector('#co-date')).not.toBeNull();
    expect(document.body.querySelector('#co-note')).not.toBeNull();
  });

  it('un error del servidor se muestra y el diálogo sigue abierto', async () => {
    mockApi({
      [`POST /api/v1/assets/${asset.id}/checkout`]: () =>
        jsonResponse(
          {
            type: 'https://inventarius.local/problems/conflict',
            title: 'Conflicto',
            status: 409,
            detail: 'El activo ya está asignado',
          },
          409,
        ),
    });
    const w = await open();
    // Sin elegir destino el envío se frena en el cliente; se simula el destino para llegar al servidor.
    (w.vm as unknown as { $: { setupState: { target: unknown } } }).$.setupState.target = {
      id: '018f0000-0000-7000-8000-0000000000aa',
      name: 'Olga',
    };
    await flushPromises();
    await submit();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'ya está asignado',
    );
    expect(w.emitted('update:visible')).toBeUndefined();
  });
});
