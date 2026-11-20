import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import ConsumableFormDialog from './ConsumableFormDialog.vue';
import { consumable, ids } from './fixtures';

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

type State = Record<string, unknown>;
async function open(item: ReturnType<typeof consumable> | null = null) {
  const w = mount(ConsumableFormDialog, {
    props: { item, visible: false },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await w.setProps({ visible: true });
  await flushPromises();
  return { w, state: (w.vm as unknown as { $: { setupState: State } }).$.setupState };
}
const type = async (selector: string, value: string) => {
  const input = document.body.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
};
const submit = async () => {
  document.body.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  await flushPromises();
};

describe('formulario de consumible (RF-70, D4, D9)', () => {
  it('pide nombre, categoría y unidad', async () => {
    mockApi({});
    await open();
    await submit();
    expect(document.body.textContent?.match(/Este campo es obligatorio/g)).toHaveLength(3);
  });

  it('el mínimo respeta los decimales de la unidad elegida', async () => {
    const fetchMock = mockApi({});
    const { state } = await open();
    await type('#cs-name', 'Guantes');
    state['category'] = { id: ids.cat, name: 'EPP' };
    state['unit'] = { id: ids.unit, name: 'par', decimals: 0 };
    await flushPromises();
    await type('#cs-min', '2,5');
    await submit();
    expect(document.body.textContent).toContain('solo cantidades enteras');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/consumables'))).toBe(false);
  });

  it('envía los mínimos global y por bodega con punto decimal', async () => {
    const fetchMock = mockApi({
      'POST /api/v1/consumables': () => jsonResponse(consumable(), 201),
    });
    const { state } = await open();
    await type('#cs-name', 'Alcohol gel');
    state['category'] = { id: ids.cat, name: 'EPP' };
    state['unit'] = { id: ids.unit, name: 'litro', decimals: 3 };
    state['minimums'] = [
      { key: 1, warehouse: { id: ids.main, name: 'Bodega central' }, quantity: '0,5' },
    ];
    await flushPromises();
    await type('#cs-min', '2,5');
    await submit();
    const call = fetchMock.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'POST',
    )!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      name: 'Alcohol gel',
      categoryId: ids.cat,
      unitId: ids.unit,
      notes: null,
      minStock: '2.5',
      warehouseMinimums: [{ locationId: ids.main, minQuantity: '0.5' }],
    });
  });

  it('con movimientos la unidad no se puede cambiar', async () => {
    mockApi({});
    await open(consumable({ hasMovements: true }));
    expect(document.body.textContent).toContain('La unidad no se puede cambiar');
    expect(document.body.querySelector<HTMLButtonElement>('#cs-unit')!.disabled).toBe(true);
  });
});
