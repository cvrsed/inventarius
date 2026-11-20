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

  it('un traslado muestra origen → destino según el sentido del stock', () => {
    const counterpart = { id: '0190d1a0-0000-7000-8000-0000000000a2', name: 'Bodega anexo' };
    const out = describeMovement(
      movement({ kind: 'transfer_out', delta: '-2', counterpartLocation: counterpart }),
      par,
      t,
    );
    expect(out.place).toBe('Bodega central → Bodega anexo');
    const inn = describeMovement(
      movement({ kind: 'transfer_in', delta: '2', counterpartLocation: counterpart }),
      par,
      t,
    );
    expect(inn.place).toBe('Bodega anexo → Bodega central');
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
