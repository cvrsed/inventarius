import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import { useConfirm } from '@/shared/ui/useConfirm';
import { consumable, ids, movement } from './fixtures';
import MovementDialog, { type MovementKindForm } from './MovementDialog.vue';

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  useConfirm().close();
  vi.unstubAllGlobals();
});

type State = Record<string, unknown>;
async function open(kind: MovementKindForm, one = false) {
  const base = consumable();
  const w = mount(MovementDialog, {
    props: {
      kind,
      visible: false,
      // Con una sola bodega con stock, el origen queda elegido solo.
      consumable: one ? { ...base, stockByWarehouse: [base.stockByWarehouse[0]!] } : base,
    },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await w.setProps({ visible: true });
  await flushPromises();
  const state = (w.vm as unknown as { $: { setupState: State } }).$.setupState;
  return { w, state };
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
const posted = (fetchMock: ReturnType<typeof mockApi>, part: string) =>
  fetchMock.mock.calls.filter((c) => String(c[0]).includes(part));

describe('entrega (RF-72, D5)', () => {
  it('muestra el tope de stock de la bodega y no deja entregar más', async () => {
    const fetchMock = mockApi({});
    await open('delivery', true);
    expect(document.body.textContent).toContain('Máximo disponible en esta bodega: 10 pares');
    await type('#mv-quantity', '11');
    (document.body.querySelector('#mv-quantity') as HTMLElement).dispatchEvent(new Event('change'));
    await submit();
    expect(document.body.textContent).toContain('No puede superar lo disponible: 10 pares');
    expect(posted(fetchMock, 'deliveries')).toHaveLength(0);
  });

  it('rechaza decimales en una unidad entera', async () => {
    const fetchMock = mockApi({});
    const { state } = await open('delivery', true);
    state['recipientKind'] = 'text';
    state['recipientName'] = 'Persona Inventada';
    await flushPromises();
    await type('#mv-quantity', '2,5');
    await submit();
    expect(document.body.textContent).toContain('solo cantidades enteras');
    expect(posted(fetchMock, 'deliveries')).toHaveLength(0);
  });

  it('exige quién recibe: persona del sistema o nombre escrito', async () => {
    mockApi({});
    const { state } = await open('delivery', true);
    await type('#mv-quantity', '2');
    await submit();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    state['recipientKind'] = 'text';
    await flushPromises();
    expect(document.body.querySelector('#mv-rname')).not.toBeNull();
    expect(document.body.querySelector('#mv-rref')).not.toBeNull();
  });

  it('envía la entrega a un nombre escrito con la cantidad normalizada', async () => {
    const fetchMock = mockApi({
      [`POST /api/v1/consumables/${ids.consumable}/deliveries`]: () =>
        jsonResponse(
          { movements: [movement({ kind: 'delivery', delta: '-3' })], balances: [] },
          201,
        ),
    });
    const { state, w } = await open('delivery', true);
    state['recipientKind'] = 'text';
    state['recipientName'] = 'Persona Inventada';
    state['recipientRef'] = 'ID-000';
    await flushPromises();
    await type('#mv-quantity', '3');
    await submit();
    const call = posted(fetchMock, 'deliveries')[0]!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      locationId: ids.main,
      quantity: '3',
      recipientName: 'Persona Inventada',
      recipientRef: 'ID-000',
      note: null,
    });
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false]);
  });
});

describe('ajuste (D6)', () => {
  it('antes de ajustar pide confirmar mostrando el saldo antes y después', async () => {
    const fetchMock = mockApi({
      [`POST /api/v1/consumables/${ids.consumable}/adjustments`]: () =>
        jsonResponse(
          { movements: [movement({ kind: 'adjustment', delta: '-2' })], balances: [] },
          201,
        ),
    });
    const { state } = await open('adjustment');
    state['warehouse'] = { id: ids.main, name: 'Bodega central' };
    state['direction'] = 'subtract';
    state['reason'] = 'waste_damage';
    await flushPromises();
    await type('#mv-quantity', '2');
    await submit();
    const confirm = useConfirm();
    expect(confirm.state.open).toBe(true);
    expect(confirm.state.options?.message).toContain('Bodega central');
    expect(confirm.state.options?.message).toContain('de 10 pares a 8 pares');
    expect(confirm.state.options?.message).toContain('Merma o daño');
    expect(confirm.state.options?.danger).not.toBe(true);
    expect(posted(fetchMock, 'adjustments')).toHaveLength(0);
    await confirm.state.options!.accept();
    await flushPromises();
    expect(posted(fetchMock, 'adjustments')).toHaveLength(1);
  });

  it('con el motivo «otro» la nota es obligatoria', async () => {
    mockApi({});
    const { state } = await open('adjustment');
    state['warehouse'] = { id: ids.main, name: 'Bodega central' };
    state['reason'] = 'other';
    await flushPromises();
    await type('#mv-quantity', '1');
    await submit();
    expect(useConfirm().state.open).toBe(false);
    expect(document.body.textContent).toContain('Este campo es obligatorio');
  });

  it('una resta no puede superar el stock de la bodega', async () => {
    mockApi({});
    const { state } = await open('adjustment');
    state['warehouse'] = { id: ids.annex, name: 'Bodega anexo' };
    state['reason'] = 'loss';
    state['direction'] = 'subtract';
    await flushPromises();
    await type('#mv-quantity', '3');
    await submit();
    expect(document.body.textContent).toContain('No puede superar lo disponible: 2 pares');
    expect(useConfirm().state.open).toBe(false);
  });
});

describe('traslado (D8)', () => {
  it('no deja elegir el mismo destino que el origen', async () => {
    mockApi({});
    const { state } = await open('transfer', true);
    state['destination'] = { id: ids.main, name: 'Bodega central' };
    await flushPromises();
    await type('#mv-quantity', '1');
    await submit();
    expect(document.body.textContent).toContain('El destino debe ser distinto del origen');
  });
});

describe('ingreso (RF-71)', () => {
  it('pide la bodega y envía fecha y proveedor', async () => {
    const fetchMock = mockApi({
      [`POST /api/v1/consumables/${ids.consumable}/receipts`]: () =>
        jsonResponse({ movements: [movement()], balances: [] }, 201),
    });
    const { state } = await open('receipt');
    await type('#mv-quantity', '24');
    await submit();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    state['warehouse'] = { id: ids.main, name: 'Bodega central' };
    await flushPromises();
    await type('#mv-supplier', 'Proveedor Ficticio SpA');
    await submit();
    const body = JSON.parse(String((posted(fetchMock, 'receipts')[0]![1] as RequestInit).body));
    expect(body).toMatchObject({
      locationId: ids.main,
      quantity: '24',
      supplier: 'Proveedor Ficticio SpA',
    });
    expect(body.receivedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
