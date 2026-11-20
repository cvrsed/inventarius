import { describe, expect, it } from 'vitest';
import {
  addQuantities,
  adjustmentSchema,
  compareQuantities,
  deliverySchema,
  formatQuantity,
  isPositiveQuantity,
  normalizeQuantity,
  quantityFitsUnit,
  subtractQuantities,
  transferSchema,
} from './consumables.js';

describe('cantidades decimales (sin float)', () => {
  it('normaliza a la forma canónica', () => {
    expect(normalizeQuantity('2')).toBe('2');
    expect(normalizeQuantity('2.50')).toBe('2.5');
    expect(normalizeQuantity('007.100')).toBe('7.1');
    expect(normalizeQuantity('0.000')).toBe('0');
  });

  it('rechaza lo que no es una cantidad', () => {
    for (const bad of ['', 'abc', '-1', '1,5', '1e3', '.5', '1.', ' 1', '12345678901', '1.2345']) {
      expect(() => normalizeQuantity(bad), bad).toThrow();
    }
  });

  it('exige que los decimales quepan en la unidad', () => {
    expect(quantityFitsUnit('12', 0)).toBe(true);
    expect(quantityFitsUnit('12.0', 0)).toBe(true);
    expect(quantityFitsUnit('12.5', 0)).toBe(false);
    expect(quantityFitsUnit('2.5', 3)).toBe(true);
    expect(quantityFitsUnit('2.555', 2)).toBe(false);
    expect(quantityFitsUnit('2.550', 2)).toBe(true);
  });

  it('suma, resta y compara sin errores de coma flotante', () => {
    expect(addQuantities('0.1', '0.2')).toBe('0.3');
    expect(subtractQuantities('1', '0.001')).toBe('0.999');
    expect(compareQuantities('0.3', '0.30')).toBe(0);
    expect(compareQuantities('10', '9.999')).toBe(1);
    expect(compareQuantities('1', '2')).toBe(-1);
    expect(() => subtractQuantities('1', '2')).not.toThrow();
    expect(subtractQuantities('1', '2')).toBe('-1');
  });

  it('detecta cantidades positivas', () => {
    expect(isPositiveQuantity('0.001')).toBe(true);
    expect(isPositiveQuantity('0')).toBe(false);
  });

  it('formatea con coma decimal es-CL, miles con punto y la unidad en singular o plural', () => {
    const par = { name: 'par', plural: 'pares', abbreviation: 'par', decimals: 0 };
    const litro = { name: 'litro', plural: 'litros', abbreviation: 'L', decimals: 3 };
    expect(formatQuantity('12', par)).toBe('12 pares');
    expect(formatQuantity('1', par)).toBe('1 par');
    expect(formatQuantity('2.5', litro)).toBe('2,5 L');
    expect(formatQuantity('1234.5', litro)).toBe('1.234,5 L');
    expect(formatQuantity('0', par)).toBe('0 pares');
  });
});

describe('esquemas de movimientos', () => {
  const id = '0190d1a0-0000-7000-8000-000000000001';
  const other = '0190d1a0-0000-7000-8000-000000000002';

  it('la entrega exige un receptor: usuario o nombre, no ambos ni ninguno', () => {
    const base = { locationId: id, quantity: '2' };
    expect(deliverySchema.safeParse({ ...base }).success).toBe(false);
    expect(deliverySchema.safeParse({ ...base, recipientUserId: id }).success).toBe(true);
    expect(deliverySchema.safeParse({ ...base, recipientName: 'Persona Inventada' }).success).toBe(
      true,
    );
    expect(
      deliverySchema.safeParse({ ...base, recipientUserId: id, recipientName: 'Otra' }).success,
    ).toBe(false);
    expect(deliverySchema.safeParse({ ...base, recipientName: '   ' }).success).toBe(false);
  });

  it('el ajuste con motivo «otro» exige nota', () => {
    const base = { locationId: id, direction: 'subtract', quantity: '1' };
    expect(adjustmentSchema.safeParse({ ...base, reason: 'loss' }).success).toBe(true);
    expect(adjustmentSchema.safeParse({ ...base, reason: 'other' }).success).toBe(false);
    expect(adjustmentSchema.safeParse({ ...base, reason: 'other', note: 'Se mojó' }).success).toBe(
      true,
    );
    expect(adjustmentSchema.safeParse({ ...base, reason: 'invented' }).success).toBe(false);
  });

  it('el traslado exige origen distinto de destino y cantidad positiva', () => {
    expect(
      transferSchema.safeParse({ fromLocationId: id, toLocationId: id, quantity: '1' }).success,
    ).toBe(false);
    expect(
      transferSchema.safeParse({ fromLocationId: id, toLocationId: other, quantity: '0' }).success,
    ).toBe(false);
    expect(
      transferSchema.safeParse({ fromLocationId: id, toLocationId: other, quantity: '1' }).success,
    ).toBe(true);
  });
});
