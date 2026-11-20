import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { Permission } from '@inventarius/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { mockApi, pagePlugins } from '@/test-utils';
import ConsumableDetailPage from './ConsumableDetailPage.vue';
import { consumable, ids, movement } from './fixtures';

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const ALL: Permission[] = [
  'consumables:read',
  'consumables:manage',
  'consumables:receive',
  'consumables:deliver',
  'consumables:transfer',
  'consumables:adjust',
  'consumables:reverse',
];

async function mountPage(permissions: Permission[], detail = consumable(), history = [movement()]) {
  mockApi({
    [`GET /api/v1/consumables/${ids.consumable}`]: () => detail,
    [`GET /api/v1/consumables/${ids.consumable}/movements`]: () => ({
      data: history,
      meta: { page: 1, pageSize: 10, total: history.length },
    }),
  });
  const global = pagePlugins();
  useAuthStore(global.plugins![0] as never).user = {
    id: ids.user,
    email: 'x@y.cl',
    name: 'X',
    mustChangePassword: false,
    roles: [],
    permissions,
  };
  await router.push(`/consumibles/${ids.consumable}`);
  await router.isReady();
  const w = mount(ConsumableDetailPage, { global, attachTo: document.body });
  mounted.push(w);
  await flushPromises();
  return w;
}

const button = (w: VueWrapper, label: string) =>
  w.findAll('button').find((b) => b.text().includes(label));

describe('ficha del consumible (RF-73, RF-74)', () => {
  it('muestra el stock por bodega con unidad, el total y el aviso de mínimo', async () => {
    const w = await mountPage(['consumables:read']);
    const text = w.text();
    expect(text).toContain('Guantes de nitrilo');
    expect(text).toContain('10 pares');
    expect(text).toContain('2 pares');
    expect(text).toContain('12 pares');
    expect(text).toContain('El total (12 pares) está bajo el mínimo (20 pares).');
    expect(text).toContain('Bajo mínimo');
    // Un lector no ve ninguna acción de movimiento.
    expect(button(w, 'Ingresar')).toBeUndefined();
    expect(button(w, 'Entregar')).toBeUndefined();
    expect(button(w, 'Anular')).toBeUndefined();
  });

  it('desactivado: ingresar, entregar y trasladar se ven apagados con el motivo; ajustar sigue disponible', async () => {
    const w = await mountPage(ALL, consumable({ active: false, lowStock: false }));
    for (const label of ['Ingresar', 'Entregar', 'Trasladar']) {
      const b = button(w, label)!;
      expect(b.attributes('disabled'), label).toBeDefined();
      expect(b.attributes('aria-describedby'), label).toBeTruthy();
    }
    expect(w.text()).toContain(
      'Desactivado: no admite ingresos, entregas, devoluciones ni traslados.',
    );
    expect(button(w, 'Ajustar')!.attributes('disabled')).toBeUndefined();
    expect(w.text()).toContain('Este consumible está desactivado');
  });

  it('con movimientos no se puede eliminar y dice por qué', async () => {
    const w = await mountPage(ALL);
    const del = button(w, 'Eliminar')!;
    expect(del.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('No se puede eliminar porque tiene movimientos');
  });

  it('sin stock en ninguna bodega no se puede entregar', async () => {
    const base = consumable();
    const w = await mountPage(
      ALL,
      consumable({
        totalStock: '0',
        stockByWarehouse: base.stockByWarehouse.map((s) => ({ ...s, quantity: '0' })),
      }),
    );
    expect(button(w, 'Entregar')!.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('No hay stock en ninguna bodega para entregar.');
  });

  it('el historial enlaza el movimiento anulado con su anulación y al revés', async () => {
    const reversal = movement({
      id: '0190d1a0-0000-7000-8000-0000000000f2',
      kind: 'reversal',
      delta: '-12',
      note: 'Ingreso duplicado',
      reversible: false,
      reverses: { id: ids.movement, kind: 'receipt', at: '2026-11-16T12:00:00.000Z' },
    });
    const original = movement({
      reversible: false,
      reversedBy: {
        id: reversal.id,
        at: '2026-11-17T12:00:00.000Z',
        actorName: 'Ada Admin',
      },
    });
    const w = await mountPage(ALL, consumable(), [reversal, original]);
    const text = w.text();
    expect(text).toContain('Anulado por Ada Admin el 17-11-2026');
    expect(text).toContain('Anula ingreso del 16-11-2026');
    expect(text).toContain('Motivo de la anulación');
    expect(w.findAll('a').filter((a) => a.text() === 'Ir al movimiento')).toHaveLength(2);
    // Lo ya anulado y las anulaciones no se pueden anular otra vez: no hay botón «Anular».
    expect(button(w, 'Anular')).toBeUndefined();
  });

  it('«Ajustar» es de consumables:adjust y «Anular» de consumables:reverse, cada uno por separado (P2)', async () => {
    const both = await mountPage(ALL);
    expect(button(both, 'Anular')).toBeDefined();
    expect(button(both, 'Ajustar')).toBeDefined();
    both.unmount();
    mounted.pop();
    const onlyAdjust = await mountPage(ALL.filter((p) => p !== 'consumables:reverse'));
    expect(button(onlyAdjust, 'Anular')).toBeUndefined();
    expect(button(onlyAdjust, 'Ajustar')).toBeDefined();
    onlyAdjust.unmount();
    mounted.pop();
    const onlyReverse = await mountPage(ALL.filter((p) => p !== 'consumables:adjust'));
    expect(button(onlyReverse, 'Anular')).toBeDefined();
    expect(button(onlyReverse, 'Ajustar')).toBeUndefined();
  });

  it('el historial usa «Ver más» y filtros de bodega, tipo y fecha', async () => {
    const w = await mountPage(['consumables:read']);
    const text = w.text();
    for (const label of ['Bodega', 'Tipo', 'Desde', 'Hasta']) expect(text).toContain(label);
  });

  describe('devoluciones (P1)', () => {
    const delivery = (over = {}) =>
      movement({
        id: '0190d1a0-0000-7000-8000-0000000000f2',
        kind: 'delivery',
        delta: '-4',
        recipient: { userId: null, name: 'Persona Inventada', ref: null },
        returned: '1',
        returnable: true,
        reversible: false,
        ...over,
      });

    it('la entrega muestra «Devuelto x de y» y la acción, y no se anula con devoluciones vigentes', async () => {
      const w = await mountPage(ALL, consumable(), [delivery()]);
      expect(w.text()).toContain('Devuelto 1 par de 4 pares');
      expect(w.text()).toContain('anula primero sus devoluciones');
      expect(button(w, 'Registrar devolución')).toBeTruthy();
      expect(button(w, 'Anular')).toBeUndefined();
    });

    it('sin consumables:deliver no hay acción de devolver; ya devuelta del todo tampoco', async () => {
      const w = await mountPage(['consumables:read'], consumable(), [delivery()]);
      expect(button(w, 'Registrar devolución')).toBeUndefined();
      const full = await mountPage(ALL, consumable(), [
        delivery({ returned: '4', returnable: false }),
      ]);
      expect(full.text()).toContain('Devuelto 4 pares de 4 pares');
      expect(
        full.findAll('button').filter((b) => b.text().includes('Registrar devolución')),
      ).toHaveLength(0);
    });

    it('una devolución enlaza con su entrega', async () => {
      const ret = movement({
        id: '0190d1a0-0000-7000-8000-0000000000f3',
        kind: 'return',
        delta: '1',
        recipient: { userId: null, name: 'Persona Inventada', ref: null },
        returnOf: { id: '0190d1a0-0000-7000-8000-0000000000f2', at: '2026-11-16T12:00:00.000Z' },
      });
      const w = await mountPage(ALL, consumable(), [ret, delivery()]);
      expect(w.text()).toContain('Devolución');
      expect(w.text()).toContain('Devuelve la entrega del');
    });
  });

  describe('fecha pasada en el historial (P6)', () => {
    it('un ingreso retroactivo muestra solo la fecha y una línea «Registrado el … por …»', async () => {
      const past = movement({
        occurredAt: '2026-11-10T15:00:00.000Z',
        registeredAt: '2026-11-16T18:45:00.000Z',
        backdated: true,
      });
      const w = await mountPage(['consumables:read'], consumable(), [past]);
      const text = w.text();
      expect(text).toContain('10-11-2026');
      expect(text).not.toContain('10-11-2026 12:00');
      expect(text).toContain('Registrado el 16-11-2026 15:45 por Olga Operadora');
    });

    it('un movimiento de hoy muestra fecha y hora, sin la línea de registro', async () => {
      const w = await mountPage(['consumables:read'], consumable(), [movement()]);
      expect(w.text()).toContain('16-11-2026 09:00');
      expect(w.text()).not.toContain('Registrado el');
    });
  });

  describe('traslado como una sola entrada (P8)', () => {
    const transfer = movement({
      id: '0190d1a0-0000-7000-8000-0000000000f4',
      kind: 'transfer_out',
      delta: '-2',
      counterpartLocation: { id: ids.annex, name: 'Bodega anexo' },
    });

    it('muestra «Traslado: origen → destino, N unidades» con un solo botón Anular', async () => {
      const w = await mountPage(ALL, consumable(), [transfer]);
      expect(w.text()).toContain('Traslado: Bodega central → Bodega anexo, 2 pares');
      const undo = w.findAll('button').filter((b) => b.text().includes('Anular'));
      expect(undo).toHaveLength(1);
      expect(undo[0]!.attributes('aria-label')).toContain(
        'Traslado: Bodega central → Bodega anexo',
      );
    });

    it('el filtro de tipo ofrece un solo «Traslado»', async () => {
      const w = await mountPage(['consumables:read']);
      const labels = (
        w.vm as unknown as { $: { setupState: { kindItems: { label: string }[] } } }
      ).$.setupState.kindItems.map((i) => i.label);
      expect(labels.filter((l) => l === 'Traslado')).toHaveLength(1);
      expect(labels).toContain('Devolución');
    });
  });
});
