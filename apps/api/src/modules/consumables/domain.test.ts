import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../core/errors.js';
import { assertQuantityFitsUnit, isBelowMinimum, signedDelta } from './domain.js';

const par = { id: 'u1', name: 'par', plural: 'pares', abbreviation: 'par', decimals: 0 };
const litro = { id: 'u2', name: 'litro', plural: 'litros', abbreviation: 'L', decimals: 3 };

describe('dominio de consumibles', () => {
  it('rechaza más decimales de los que permite la unidad', () => {
    expect(() => assertQuantityFitsUnit('2.5', par, 'quantity')).toThrow(ValidationError);
    expect(() => assertQuantityFitsUnit('2.5', litro, 'quantity')).not.toThrow();
  });

  it('el error de decimales dice cuántos admite la unidad', () => {
    try {
      assertQuantityFitsUnit('2.5', par, 'quantity');
      expect.unreachable();
    } catch (e) {
      const err = e as ValidationError;
      expect(err.fieldErrors?.['quantity']?.[0]).toContain('pares');
      expect(err.fieldErrors?.['quantity']?.[0]).toContain('sin decimales');
    }
  });

  it('está bajo el mínimo solo si es estrictamente menor', () => {
    expect(isBelowMinimum('4', '5')).toBe(true);
    expect(isBelowMinimum('5', '5')).toBe(false);
    expect(isBelowMinimum('0', '5')).toBe(true);
    expect(isBelowMinimum('1', null)).toBe(false);
  });

  it('el ajuste suma o resta con signo', () => {
    expect(signedDelta('add', '2.5')).toBe('2.5');
    expect(signedDelta('subtract', '2.5')).toBe('-2.5');
  });
});
