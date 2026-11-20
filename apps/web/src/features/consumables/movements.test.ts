import type { MovementDto } from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import { messages } from '@/app/i18n/es-CL';
import { describeMovement, signedQuantity } from './movements';

const lookup = (key: string): string =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], messages) as string;
const t = (key: string) => lookup(key);

const par = { id: 'u', name: 'par', plural: 'pares', abbreviation: 'par', decimals: 0 };
const litro = { id: 'v', name: 'litro', plural: 'litros', abbreviation: 'L', decimals: 3 };

const movement = (over: Partial<MovementDto>): MovementDto => ({
  id: '0190d1a0-0000-7000-8000-000000000001',
  kind: 'receipt',
  location: { id: '0190d1a0-0000-7000-8000-0000000000a1', name: 'Bodega central' },
  delta: '12',
  occurredAt: '2026-11-16T12:00:00.000Z',
  registeredAt: '2026-11-16T12:00:00.000Z',
  backdated: false,
  actor: null,
  supplier: null,
  note: null,
  reason: null,
  recipient: null,
  counterpartLocation: null,
  reversedBy: null,
  reverses: null,
  reversible: true,
  returned: null,
  returnable: false,
  returnOf: null,
  ...over,
});

describe('historial de movimientos', () => {
  it('muestra cantidades con signo, unidad y coma decimal', () => {
    expect(signedQuantity('12', par)).toBe('+12 pares');
    expect(signedQuantity('-1', par)).toBe('−1 par');
    expect(signedQuantity('-2.5', litro)).toBe('−2,5 L');
  });

  it('una entrega dice quién recibió, con su identificador', () => {
    const v = describeMovement(
      movement({
        kind: 'delivery',
        delta: '-3',
        recipient: { userId: null, name: 'Persona Inventada', ref: 'ID-000' },
      }),
      par,
      t,
    );
    expect(v.title).toBe('Entrega');
    expect(v.quantity).toBe('−3 pares');
    expect(v.lines).toEqual([{ label: 'Recibió', value: 'Persona Inventada (ID-000)' }]);
  });

  it('un ajuste muestra el motivo traducido, no la clave', () => {
    const v = describeMovement(
      movement({ kind: 'adjustment', delta: '-1', reason: 'waste_damage' }),
      par,
      t,
    );
    expect(v.lines[0]).toEqual({ label: 'Motivo', value: 'Merma o daño' });
    expect(JSON.stringify(v)).not.toContain('waste_damage');
  });

  it('un traslado es una sola entrada: «Traslado: origen → destino, N unidades» (P8)', () => {
    const counterpart = { id: '0190d1a0-0000-7000-8000-0000000000a2', name: 'Bodega anexo' };
    const v = describeMovement(
      movement({ kind: 'transfer_out', delta: '-2', counterpartLocation: counterpart }),
      par,
      t,
    );
    expect(v.title).toBe('Traslado');
    expect(v.place).toBe('Bodega central → Bodega anexo');
    expect(v.quantity).toBe('2 pares');
    expect(v.headline).toBe('Traslado: Bodega central → Bodega anexo, 2 pares');
  });

  it('la anulación de un traslado también es una entrada, con el sentido contrario', () => {
    const counterpart = { id: '0190d1a0-0000-7000-8000-0000000000a2', name: 'Bodega anexo' };
    const v = describeMovement(
      movement({
        kind: 'reversal',
        delta: '2',
        note: 'Bodega equivocada',
        counterpartLocation: counterpart,
        reverses: {
          id: '0190d1a0-0000-7000-8000-0000000000f9',
          kind: 'transfer_out',
          at: '2026-11-16T12:00:00.000Z',
        },
      }),
      par,
      t,
    );
    expect(v.headline).toBe('Anulación de traslado: Bodega anexo → Bodega central, 2 pares');
    expect(v.lines).toEqual([{ label: 'Motivo de la anulación', value: 'Bodega equivocada' }]);
  });

  it('el resto de los movimientos conservan «Tipo +cantidad» y su bodega', () => {
    const v = describeMovement(movement({ kind: 'receipt', delta: '12' }), par, t);
    expect(v.headline).toBe('Ingreso +12 pares');
    expect(v.place).toBe('Bodega central');
  });

  it('una anulación muestra su motivo como tal', () => {
    const v = describeMovement(
      movement({ kind: 'reversal', delta: '-4', note: 'Entrega duplicada' }),
      par,
      t,
    );
    expect(v.title).toBe('Anulación');
    expect(v.lines).toEqual([{ label: 'Motivo de la anulación', value: 'Entrega duplicada' }]);
  });
});
