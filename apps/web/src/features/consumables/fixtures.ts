import type { ConsumableDetailDto, MovementDto } from '@inventarius/shared';

export const ids = {
  consumable: '0190d1a0-0000-7000-8000-0000000000c1',
  main: '0190d1a0-0000-7000-8000-0000000000a1',
  annex: '0190d1a0-0000-7000-8000-0000000000a2',
  cat: '0190d1a0-0000-7000-8000-0000000000b1',
  unit: '0190d1a0-0000-7000-8000-0000000000d1',
  user: '0190d1a0-0000-7000-8000-0000000000e1',
  movement: '0190d1a0-0000-7000-8000-0000000000f1',
};

export const par = { id: ids.unit, name: 'par', plural: 'pares', abbreviation: 'par', decimals: 0 };

/** Guantes (datos inventados): 10 pares en la bodega central y 2 en el anexo; mínimo global 20. */
export const consumable = (over: Partial<ConsumableDetailDto> = {}): ConsumableDetailDto => ({
  id: ids.consumable,
  name: 'Guantes de nitrilo',
  category: { id: ids.cat, name: 'EPP' },
  unit: par,
  notes: null,
  minStock: '20',
  totalStock: '12',
  belowMinimum: true,
  warehousesBelowMinimum: 0,
  lowStock: true,
  active: true,
  hasMovements: true,
  updatedAt: '2026-11-16T12:00:00.000Z',
  stockByWarehouse: [
    {
      location: { id: ids.main, name: 'Bodega central', path: 'Bodega central', active: true },
      quantity: '10',
      minQuantity: null,
      belowMinimum: false,
    },
    {
      location: { id: ids.annex, name: 'Bodega anexo', path: 'Bodega anexo', active: true },
      quantity: '2',
      minQuantity: null,
      belowMinimum: false,
    },
  ],
  ...over,
});

export const movement = (over: Partial<MovementDto> = {}): MovementDto => ({
  id: ids.movement,
  kind: 'receipt',
  location: { id: ids.main, name: 'Bodega central' },
  delta: '12',
  occurredAt: '2026-11-16T12:00:00.000Z',
  registeredAt: '2026-11-16T12:00:00.000Z',
  backdated: false,
  actor: { id: ids.user, name: 'Olga Operadora' },
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
