import { describe, expect, it } from 'vitest';
import { messages } from '@/app/i18n/es-CL';
import { lowStockLabel, lowStockReasons } from './lowStock';

/** `t` mínimo con la pluralización de vue-i18n («singular | plural») para probar los textos reales. */
const t = (key: string, params: Record<string, unknown> = {}, plural?: number): string => {
  const raw = key
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], messages) as string;
  const forms = raw.split(' | ');
  const form = forms.length > 1 ? (plural === 1 ? forms[0]! : forms[1]!) : raw;
  return form.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k]));
};

describe('motivo del «bajo mínimo» (P9)', () => {
  it('dice si es por el mínimo global', () => {
    expect(lowStockReasons({ belowMinimum: true, warehousesBelowMinimum: 0 }, t)).toEqual([
      'Bajo mínimo global',
    ]);
  });

  it('dice cuántas bodegas están bajo su mínimo, en singular y plural', () => {
    expect(lowStockReasons({ belowMinimum: false, warehousesBelowMinimum: 1 }, t)).toEqual([
      '1 bodega bajo mínimo',
    ]);
    expect(lowStockReasons({ belowMinimum: false, warehousesBelowMinimum: 3 }, t)).toEqual([
      '3 bodegas bajo mínimo',
    ]);
  });

  it('con ambos motivos los dice los dos, y sin ninguno no dice nada', () => {
    const both = { belowMinimum: true, warehousesBelowMinimum: 2 };
    expect(lowStockLabel(both, t)).toBe('Bajo mínimo global · 2 bodegas bajo mínimo');
    expect(lowStockReasons({ belowMinimum: false, warehousesBelowMinimum: 0 }, t)).toEqual([]);
  });
});
