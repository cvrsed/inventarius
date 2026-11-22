import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { Permission } from '@inventarius/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useConfirm } from '@/shared/ui/useConfirm';
import { mockApi, pagePlugins } from '@/test-utils';
import ConsumableDetailPage from './ConsumableDetailPage.vue';
import { consumable, ids, movement } from './fixtures';

const mounted: VueWrapper[] = [];
afterEach(() => {
  useConfirm().close();
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
    expect(text).toContain('El total (12 pares) está bajo el mínimo global (20 pares).');
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
    const links = w.findAll('a').filter((a) => a.text() === 'Ir al movimiento');
    expect(links).toHaveLength(2);
    // El enlace no se parte entre líneas (D21).
    for (const link of links) expect(link.classes()).toContain('whitespace-nowrap');
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

  it('la alerta de bajo mínimo nombra las bodegas que lo están (P9)', async () => {
    const base = consumable();
    const w = await mountPage(
      ['consumables:read'],
      consumable({
        belowMinimum: false,
        warehousesBelowMinimum: 1,
        totalStock: '27',
        stockByWarehouse: [
          base.stockByWarehouse[0]!,
          { ...base.stockByWarehouse[1]!, quantity: '2', minQuantity: '5', belowMinimum: true },
        ],
      }),
    );
    const lines = w.findAll('[data-testid="below-warehouse"]').map((l) => l.text());
    expect(lines).toEqual(['En «Bodega anexo» hay 2 pares y su mínimo es 5 pares.']);
    expect(w.text()).toContain('1 bodega bajo mínimo');
    expect(w.text()).not.toContain('Bajo mínimo global');
  });

  it('el mínimo de una bodega inactiva se ve atenuado con la nota y no genera aviso (D16)', async () => {
    const base = consumable();
    const w = await mountPage(
      ['consumables:read'],
      consumable({
        belowMinimum: false,
        lowStock: false,
        warehousesBelowMinimum: 0,
        totalStock: '12',
        stockByWarehouse: [
          base.stockByWarehouse[0]!,
          {
            ...base.stockByWarehouse[1]!,
            location: { ...base.stockByWarehouse[1]!.location, active: false },
            quantity: '2',
            minQuantity: '5',
            belowMinimum: false,
          },
        ],
      }),
    );
    const cell = w.get('[data-testid="inactive-minimum"]');
    expect(cell.text()).toBe('5 pares (bodega inactiva)');
    expect(cell.classes()).toContain('text-muted');
    expect(w.findAll('[data-testid="below-warehouse"]')).toHaveLength(0);
    expect(w.text()).not.toContain('bajo mínimo');
    expect(w.text()).not.toContain('Bajo mínimo');
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

  it('en una fila anulada, primero el origen («Devuelve la entrega…») y después «Anulado por…» (D4)', async () => {
    const ret = movement({
      id: '0190d1a0-0000-7000-8000-0000000000f3',
      kind: 'return',
      delta: '1',
      recipient: { userId: null, name: 'Persona Inventada', ref: null },
      reversible: false,
      returnOf: { id: '0190d1a0-0000-7000-8000-0000000000f2', at: '2026-11-16T12:00:00.000Z' },
      reversedBy: { id: ids.movement2, at: '2026-11-17T12:00:00.000Z', actorName: 'Ada Admin' },
    });
    const w = await mountPage(ALL, consumable(), [ret]);
    const text = w.text();
    expect(text.indexOf('Devuelve la entrega del')).toBeGreaterThan(-1);
    expect(text.indexOf('Devuelve la entrega del')).toBeLessThan(text.indexOf('Anulado por'));
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

    it('muestra el título «Traslado 2 pares», la ruta debajo y un solo botón Anular (D15)', async () => {
      const w = await mountPage(ALL, consumable(), [transfer]);
      expect(w.text()).toContain('Traslado 2 pares');
      expect(w.get('[data-testid="transfer-route"]').text()).toBe('Bodega central → Bodega anexo');
      const undo = w.findAll('button').filter((b) => b.text().includes('Anular'));
      expect(undo).toHaveLength(1);
      expect(undo[0]!.attributes('aria-label')).toContain('Traslado 2 pares');
    });

    it('con rutas largas muestra los nombres cortos y la ruta completa en el tooltip (D15)', async () => {
      const long = movement({
        id: '0190d1a0-0000-7000-8000-0000000000f9',
        kind: 'transfer_out',
        delta: '-5',
        location: { id: ids.main, name: 'Cliente Inventado > Sede Norte > Bodega Anexo' },
        counterpartLocation: {
          id: ids.annex,
          name: 'Cliente Inventado > Sede Sur > Bodega Cristobal Gambi',
        },
      });
      const w = await mountPage(ALL, consumable(), [long]);
      const route = w.get('[data-testid="transfer-route"]');
      expect(route.text()).toBe('Bodega Anexo → Bodega Cristobal Gambi');
      expect(route.attributes('title')).toBe(
        'Cliente Inventado > Sede Norte > Bodega Anexo → Cliente Inventado > Sede Sur > Bodega Cristobal Gambi',
      );
      expect(w.text()).toContain('Traslado 5 pares');
      expect(w.text()).not.toContain('Sede Norte');
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

  describe('íconos (P12)', () => {
    it('cada botón de acción dibuja un ícono distinto', async () => {
      const w = await mountPage(ALL, consumable(), [
        movement({
          id: '0190d1a0-0000-7000-8000-0000000000f6',
          kind: 'delivery',
          delta: '-4',
          recipient: { userId: null, name: 'Persona Inventada', ref: null },
          returned: '0',
          returnable: true,
        }),
      ]);
      // Los íconos van empaquetados como SVG en línea: lo que distingue a uno de otro es su trazado.
      const drawing = (label: string) =>
        w
          .findAll('button')
          .find((x) => x.text().includes(label))!
          .find('svg')
          .html();
      const labels = [
        'Ingresar',
        'Entregar',
        'Trasladar',
        'Ajustar',
        'Registrar devolución',
        'Anular',
      ];
      const drawings = labels.map(drawing);
      expect(drawings.every((d) => d.includes('<path'))).toBe(true);
      expect(new Set(drawings).size).toBe(labels.length);
    });
  });

  describe('selector de bodega del filtro del historial (P13)', () => {
    it('lista las bodegas con su stock a la derecha y filtra el historial al elegir una', async () => {
      const w = await mountPage(['consumables:read']);
      (document.body.querySelector('#hs-warehouse') as HTMLElement).click();
      await flushPromises();
      const options = [...document.body.querySelectorAll<HTMLElement>('[role="option"]')];
      expect(options.map((o) => o.textContent)).toEqual([
        expect.stringContaining('Todas las bodegas'),
        expect.stringContaining('Bodega central'),
        expect.stringContaining('Bodega anexo'),
      ]);
      expect(options[1]!.querySelector('[data-testid="warehouse-stock"]')?.textContent).toBe(
        '10 pares',
      );
      options[2]!.click();
      await flushPromises();
      expect(w.text()).toContain('Limpiar filtros');
    });
  });

  describe('resaltado de «Ir al movimiento» (P14)', () => {
    const original = movement({
      reversedBy: { id: ids.movement2, at: '2026-11-17T12:00:00.000Z', actorName: 'Ada Admin' },
      reversible: false,
    });
    const reversal = movement({
      id: ids.movement2,
      kind: 'reversal',
      delta: '-12',
      note: 'Duplicado',
      reverses: { id: ids.movement, kind: 'receipt', at: '2026-11-16T12:00:00.000Z' },
      reversible: false,
    });

    afterEach(() => vi.useRealTimers());

    it('marca el movimiento con el color primario (borde y fondo suave) y se desvanece a los pocos segundos', async () => {
      const w = await mountPage(['consumables:read'], consumable(), [reversal, original]);
      vi.useFakeTimers();
      const link = w.findAll('a').find((a) => a.text() === 'Ir al movimiento')!;
      await link.trigger('click');
      await flushPromises();
      const target = w.get(`#mov-${ids.movement}`);
      expect(target.classes()).toEqual(expect.arrayContaining(['border-primary', 'bg-primary/15']));
      // No usa el gris casi invisible de antes.
      expect(target.classes()).not.toContain('bg-elevated');
      await vi.advanceTimersByTimeAsync(4000);
      expect(w.get(`#mov-${ids.movement}`).classes()).not.toContain('bg-primary/15');
      // El fundido es una transición (con movimiento reducido, un cambio directo).
      expect(w.get(`#mov-${ids.movement}`).classes()).toContain('transition-colors');
      expect(w.get(`#mov-${ids.movement}`).classes()).toContain('motion-reduce:transition-none');
    });

    it('lleva el foco al movimiento para quien usa lector de pantalla', async () => {
      const w = await mountPage(['consumables:read'], consumable(), [reversal, original]);
      const link = w.findAll('a').find((a) => a.text() === 'Ir al movimiento')!;
      await link.trigger('click');
      await flushPromises();
      expect(document.activeElement?.id).toBe(`mov-${ids.movement}`);
    });
  });

  describe('botones de acción de la ficha (P16)', () => {
    const labels = [
      'Ingresar',
      'Entregar',
      'Trasladar',
      'Ajustar',
      'Editar',
      'Desactivar',
      'Eliminar',
    ];

    it('van en una grilla de dos columnas a ancho completo, todos con el mismo tamaño y los primarios primero', async () => {
      const w = await mountPage(ALL);
      const group = w.get('[role="group"]');
      // Dos columnas en móvil; desde `sm` vuelven a ser botones en fila.
      expect(group.classes()).toEqual(expect.arrayContaining(['grid', 'grid-cols-2', 'sm:flex']));
      const buttons = group.findAll('button').filter((b) => labels.includes(b.text()));
      expect(buttons.map((b) => b.text())).toEqual(labels);
      for (const b of buttons) {
        // Mismo tamaño: ancho completo de su celda, alto mínimo táctil y contenido centrado.
        expect(b.classes(), b.text()).toEqual(
          expect.arrayContaining(['w-full', 'min-h-11', 'justify-center']),
        );
        // Si el botón va dentro de un contenedor (el del tooltip), ese también llena la celda.
        const parent = b.element.parentElement!;
        if (parent !== group.element) expect(parent.className, b.text()).toContain('w-full');
      }
      // Primarios (sólidos) antes que los neutros (contorno).
      const solid = buttons.map((b) => b.classes().includes('bg-primary'));
      expect(solid.slice(0, 2)).toEqual([true, true]);
      expect(solid.slice(2).some(Boolean)).toBe(false);
    });
  });

  describe('activar y desactivar (P18)', () => {
    it('desactivar pide confirmación con lo que implica y solo entonces manda el PATCH', async () => {
      const fetchMock = mockApi({
        [`GET /api/v1/consumables/${ids.consumable}`]: () => consumable(),
        [`GET /api/v1/consumables/${ids.consumable}/movements`]: () => ({
          data: [],
          meta: { page: 1, pageSize: 10, total: 0 },
        }),
        [`PATCH /api/v1/consumables/${ids.consumable}`]: () => consumable({ active: false }),
      });
      const global = pagePlugins();
      useAuthStore(global.plugins![0] as never).user = {
        id: ids.user,
        email: 'x@y.cl',
        name: 'X',
        mustChangePassword: false,
        roles: [],
        permissions: ALL,
      };
      await router.push(`/consumibles/${ids.consumable}`);
      await router.isReady();
      const w = mount(ConsumableDetailPage, { global, attachTo: document.body });
      mounted.push(w);
      await flushPromises();
      await button(w, 'Desactivar')!.trigger('click');
      await flushPromises();
      const confirm = useConfirm();
      expect(confirm.state.open).toBe(true);
      expect(confirm.state.options?.rows?.[0]).toEqual({
        label: 'Consumible',
        value: 'Guantes de nitrilo',
      });
      expect(confirm.state.options?.rows?.find((r) => r.highlight)?.label).toBe('Stock total');
      expect(confirm.state.options?.bullets?.[0]).toContain(
        'ingresos, entregas, devoluciones ni traslados',
      );
      expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(false);
      await confirm.state.options!.accept();
      await flushPromises();
      expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(true);
    });
  });
});
