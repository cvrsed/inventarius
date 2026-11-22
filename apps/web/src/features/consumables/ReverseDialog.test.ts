import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { MovementDto } from '@inventarius/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import { consumable, ids, movement } from './fixtures';
import ReverseDialog from './ReverseDialog.vue';

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function open(m: MovementDto) {
  const w = mount(ReverseDialog, {
    props: { movement: m, consumable: consumable(), visible: false },
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

describe('anular (D7)', () => {
  it('muestra qué se anula y el saldo antes y después', async () => {
    await open(movement({ kind: 'delivery', delta: '-4' }));
    const text = document.body.textContent ?? '';
    expect(text).toContain('Entrega −4 pares');
    expect(text).toContain('En Bodega central el stock pasará de 10 pares a 14 pares');
    expect(text).toContain('No se borra nada');
  });

  it('el motivo es obligatorio y el botón no es rojo: anular no destruye nada', async () => {
    const fetchMock = mockApi({});
    await open(movement({ kind: 'delivery', delta: '-4' }));
    const button = document.body.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.className).not.toMatch(/error/);
    await submit();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('reversals'))).toBe(false);
  });

  it('si anular dejaría el stock negativo lo dice y no deja enviar', async () => {
    // Un ingreso de 12 en una bodega que hoy tiene 10: anularlo daría −2.
    await open(movement({ kind: 'receipt', delta: '12' }));
    const text = document.body.textContent ?? '';
    expect(text).toContain('de 10 pares a −2 pares');
    expect(text).toContain('dejaría el stock en negativo en Bodega central');
    expect(document.body.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(
      true,
    );
  });

  it('un traslado muestra las dos bodegas', async () => {
    await open(
      movement({
        kind: 'transfer_out',
        delta: '-2',
        counterpartLocation: { id: ids.annex, name: 'Bodega anexo' },
      }),
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('En Bodega central el stock pasará de 10 pares a 12 pares');
    expect(text).toContain('En Bodega anexo el stock pasará de 2 pares a 0 pares');
    // «Se anulará» usa el formato corto del traslado (D15): título y, debajo, la ruta con nombres cortos.
    expect(text).toContain('Se anulará: Traslado 2 pares');
    expect(document.body.querySelector('[data-testid="reverse-place"]')!.textContent).toContain(
      'Bodega central → Bodega anexo',
    );
    expect(text).not.toContain('Traslado:');
  });

  it('envía el motivo y cierra', async () => {
    const fetchMock = mockApi({
      [`POST /api/v1/consumable-movements/${ids.movement}/reversals`]: () =>
        jsonResponse({ movements: [movement({ kind: 'reversal' })], balances: [] }, 201),
    });
    const w = await open(movement({ kind: 'delivery', delta: '-4' }));
    const area = document.body.querySelector<HTMLTextAreaElement>('#rv-reason')!;
    area.value = 'Entrega duplicada';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await submit();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('reversals'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      reason: 'Entrega duplicada',
    });
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false]);
  });
});
