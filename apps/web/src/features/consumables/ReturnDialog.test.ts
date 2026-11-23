import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { MovementDto } from '@inventarius/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import { consumable, ids, movement, warehouses } from './fixtures';
import ReturnDialog from './ReturnDialog.vue';

const mockWith = (routes: Record<string, () => unknown> = {}) =>
  mockApi({ 'GET /api/v1/locations': () => warehouses(), ...routes });

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const delivery = (): MovementDto =>
  movement({
    kind: 'delivery',
    delta: '-4',
    recipient: { userId: null, name: 'Persona Inventada', ref: null },
    returned: '1',
    returnable: true,
  });

async function open() {
  const w = mount(ReturnDialog, {
    props: { delivery: delivery(), consumable: consumable(), visible: false },
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
const type = async (id: string, value: string) => {
  const el = document.body.querySelector<HTMLInputElement>(`#${id}`)!;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
};

describe('devolución (P1)', () => {
  it('dice a quién se entregó y cuánto queda por devolver; no marca errores antes de interactuar', async () => {
    await open();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Persona Inventada');
    expect(text).toContain('Quedan por devolver 3 pares');
    expect(text).toContain('Máximo a devolver: 3 pares');
    expect(text).not.toContain('disponible en esta bodega');
    expect(text).not.toContain('Este campo es obligatorio');
  });

  it('no deja devolver más de lo que queda y no llama a la API', async () => {
    const fetchMock = mockWith({});
    await open();
    await type('rt-quantity', '4');
    await submit();
    expect(document.body.textContent).toContain(
      'No puede superar lo pendiente de devolver (3 pares)',
    );
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('returns'))).toBe(false);
  });

  it('envía la devolución a la bodega de la entrega por defecto', async () => {
    const fetchMock = mockWith({
      [`POST /api/v1/consumable-movements/${ids.movement}/returns`]: () =>
        jsonResponse({ movements: [], balances: [] }, 201),
    });
    await open();
    await type('rt-quantity', '2');
    await submit();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/returns'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toMatchObject({
      locationId: ids.main,
      quantity: '2',
    });
  });
});
