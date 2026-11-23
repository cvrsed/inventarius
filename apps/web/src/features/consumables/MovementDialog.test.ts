import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import { useConfirm } from '@/shared/ui/useConfirm';
import { consumable, ids, movement } from './fixtures';
import { ids2, warehouses } from './fixtures';
import MovementDialog, { type MovementKindForm } from './MovementDialog.vue';

const mockWith = (routes: Record<string, () => unknown> = {}) =>
  mockApi({ 'GET /api/v1/locations': () => warehouses(), ...routes });

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  useConfirm().close();
  vi.unstubAllGlobals();
});

type State = Record<string, unknown>;
async function open(kind: MovementKindForm, one = false, base = consumable()) {
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
    const fetchMock = mockWith({});
    await open('delivery', true);
    expect(document.body.textContent).toContain('Máximo disponible en esta bodega: 10 pares');
    await type('#mv-quantity', '11');
    (document.body.querySelector('#mv-quantity') as HTMLElement).dispatchEvent(new Event('change'));
    await submit();
    expect(document.body.textContent).toContain('No puede superar lo disponible: 10 pares');
    expect(posted(fetchMock, 'deliveries')).toHaveLength(0);
  });

  it('rechaza decimales en una unidad entera', async () => {
    const fetchMock = mockWith({});
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
    mockWith({});
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
    const fetchMock = mockWith({
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
    const fetchMock = mockWith({
      [`POST /api/v1/consumables/${ids.consumable}/adjustments`]: () =>
        jsonResponse(
          { movements: [movement({ kind: 'adjustment', delta: '-2' })], balances: [] },
          201,
        ),
    });
    const { state } = await open('adjustment');
    state['warehouseId'] = ids.main;
    state['direction'] = 'subtract';
    state['reason'] = 'waste_damage';
    await flushPromises();
    await type('#mv-quantity', '2');
    await submit();
    const confirm = useConfirm();
    expect(confirm.state.open).toBe(true);
    // Confirmación estructurada (D6): filas con etiqueta y el saldo destacado.
    expect(confirm.state.options?.rows).toEqual([
      { label: 'Bodega', value: 'Bodega central' },
      { label: 'Sentido', value: 'Restar del stock' },
      { label: 'Cantidad', value: '2 pares' },
      { label: 'Saldo', value: '10 → 8', highlight: true },
      { label: 'Motivo', value: 'Merma o daño' },
    ]);
    expect(confirm.state.options?.footnote).toBe(
      'Queda en el libro y no se puede editar; solo quien tenga permiso para anular movimientos puede anularlo.',
    );
    expect(confirm.state.options?.danger).not.toBe(true);
    expect(posted(fetchMock, 'adjustments')).toHaveLength(0);
    await confirm.state.options!.accept();
    await flushPromises();
    expect(posted(fetchMock, 'adjustments')).toHaveLength(1);
  });

  it('el stock disponible sale en una sola línea y el máximo solo al restar (D7)', async () => {
    mockWith({});
    const { state } = await open('adjustment');
    state['warehouseId'] = ids.main;
    state['direction'] = 'add';
    await flushPromises();
    const count = (text: string) => (document.body.textContent ?? '').split(text).length - 1;
    expect(count('Disponible en Bodega central: 10 pares')).toBe(1);
    expect(document.body.textContent).not.toContain('Máximo');
    state['direction'] = 'subtract';
    await flushPromises();
    expect(count('Máximo a restar en Bodega central: 10 pares')).toBe(1);
    expect(count('Disponible en')).toBe(0);
    expect(count('10 pares')).toBe(count('Máximo a restar en Bodega central: 10 pares'));
  });

  it('con el motivo «otro» la nota es obligatoria', async () => {
    mockWith({});
    const { state } = await open('adjustment');
    state['warehouseId'] = ids.main;
    state['reason'] = 'other';
    await flushPromises();
    await type('#mv-quantity', '1');
    await submit();
    expect(useConfirm().state.open).toBe(false);
    expect(document.body.textContent).toContain('Este campo es obligatorio');
  });

  it('una resta no puede superar el stock de la bodega', async () => {
    mockWith({});
    const { state } = await open('adjustment');
    state['warehouseId'] = ids.annex;
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
    mockWith({});
    const { state } = await open('transfer', true);
    state['destinationId'] = ids.main;
    await flushPromises();
    await type('#mv-quantity', '1');
    await submit();
    expect(document.body.textContent).toContain('El destino debe ser distinto del origen');
  });
});

describe('ingreso (RF-71)', () => {
  it('pide la bodega y envía fecha y proveedor', async () => {
    const fetchMock = mockWith({
      [`POST /api/v1/consumables/${ids.consumable}/receipts`]: () =>
        jsonResponse({ movements: [movement()], balances: [] }, 201),
    });
    const { state } = await open('receipt');
    await type('#mv-quantity', '24');
    await submit();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    state['warehouseId'] = ids.main;
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

describe('fecha del ingreso (P6)', () => {
  it('solo el ingreso tiene fecha, con tope de 90 días atrás y sin fechas futuras', async () => {
    await open('receipt');
    const date = document.body.querySelector<HTMLInputElement>('#mv-date')!;
    expect(date.max).toBe(new Date().toLocaleDateString('en-CA'));
    const min = new Date();
    min.setDate(min.getDate() - 90);
    expect(date.min).toBe(min.toLocaleDateString('en-CA'));
    expect(document.body.textContent).toContain('hasta 90 días atrás');
    for (const kind of ['delivery', 'transfer', 'adjustment'] as const) {
      mounted.splice(0).forEach((w) => w.unmount());
      document.body.innerHTML = '';
      await open(kind);
      expect(document.body.querySelector('#mv-date'), kind).toBeNull();
    }
  });

  it('una fecha de más de 90 días o futura no se envía y dice por qué', async () => {
    const fetchMock = mockWith({});
    const { state } = await open('receipt', true);
    state['warehouseId'] = ids.main;
    await flushPromises();
    await type('#mv-quantity', '2');
    await type('#mv-date', '2020-01-01');
    await submit();
    expect(document.body.textContent).toContain('más de 90 días atrás');
    expect(posted(fetchMock, 'receipts')).toHaveLength(0);
    await type('#mv-date', '2999-01-01');
    await submit();
    expect(document.body.textContent).toContain('no puede ser futura');
    expect(posted(fetchMock, 'receipts')).toHaveLength(0);
  });
});

describe('bodega inactiva con stock (P7)', () => {
  const withClosed = () => {
    const base = consumable();
    return {
      ...base,
      stockByWarehouse: [
        ...base.stockByWarehouse,
        {
          location: {
            id: ids2.closed,
            name: 'Bodega cerrada',
            path: 'Bodega cerrada',
            active: false,
          },
          quantity: '4',
          minQuantity: null,
          belowMinimum: false,
        },
      ],
    };
  };
  const optionsOf = async (kind: MovementKindForm, direction?: string) => {
    mockWith();
    const { state } = await open(kind, false, withClosed());
    if (direction) {
      state['direction'] = direction;
      await flushPromises();
    }
    (document.body.querySelector('#mv-warehouse') as HTMLElement).click();
    await flushPromises();
    return Object.fromEntries(
      [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].map((o) => [
        ['Bodega central', 'Bodega anexo', 'Bodega cerrada'].find((n) =>
          o.textContent?.includes(n),
        ) ?? '',
        o,
      ]),
    );
  };

  it('en una salida (entrega) se puede elegir la inactiva con stock, con un aviso', async () => {
    const o = await optionsOf('delivery');
    expect(o['Bodega cerrada']!.getAttribute('data-disabled')).toBeNull();
    expect(o['Bodega cerrada']!.textContent).toContain(
      'Bodega inactiva: solo se puede sacar stock',
    );
  });

  it('en una entrada (ingreso) la inactiva se ve desactivada con el motivo, no falla al enviar', async () => {
    const o = await optionsOf('receipt');
    expect(o['Bodega cerrada']!.getAttribute('data-disabled')).not.toBeNull();
    expect(o['Bodega cerrada']!.textContent).toContain('Bodega inactiva: solo admite salidas');
    expect(o['Bodega central']!.getAttribute('data-disabled')).toBeNull();
  });

  it('un ajuste que resta admite la inactiva con stock y uno que suma no', async () => {
    const subtract = await optionsOf('adjustment', 'subtract');
    expect(subtract['Bodega cerrada']!.getAttribute('data-disabled')).toBeNull();
    mounted.splice(0).forEach((w) => w.unmount());
    document.body.innerHTML = '';
    const add = await optionsOf('adjustment', 'add');
    expect(add['Bodega cerrada']!.getAttribute('data-disabled')).not.toBeNull();
  });

  it('las bodegas sin stock se ven desactivadas al sacar, con el motivo', async () => {
    const o = await optionsOf('delivery');
    expect(o['Bodega anexo']!.getAttribute('data-disabled')).toBeNull(); // el anexo tiene 2 pares
    mounted.splice(0).forEach((w) => w.unmount());
    document.body.innerHTML = '';
    mockWith();
    await open('delivery', true);
    (document.body.querySelector('#mv-warehouse') as HTMLElement).click();
    await flushPromises();
    const anexo = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')].find((x) =>
      x.textContent?.includes('Bodega anexo'),
    )!;
    expect(anexo.getAttribute('data-disabled')).not.toBeNull();
    expect(anexo.textContent).toContain('Sin stock');
  });
});
