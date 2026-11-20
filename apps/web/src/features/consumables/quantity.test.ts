import { describe, expect, it } from 'vitest';
import { quantityProblem, toApiQuantity } from './quantity';

const par = { id: 'u', name: 'par', plural: 'pares', abbreviation: 'par', decimals: 0 };
const litro = { id: 'v', name: 'litro', plural: 'litros', abbreviation: 'L', decimals: 3 };

describe('cantidades escritas por una persona', () => {
  it('acepta la coma decimal de es-CL', () => {
    expect(toApiQuantity(' 2,5 ')).toBe('2.5');
  });

  it('valida sin usar float', () => {
    expect(quantityProblem('', par)).toBe('required');
    expect(quantityProblem('abc', par)).toBe('invalid');
    expect(quantityProblem('-1', par)).toBe('invalid');
    expect(quantityProblem('0', par)).toBe('zero');
    expect(quantityProblem('2,5', par)).toBe('decimals');
    expect(quantityProblem('2,5', litro)).toBeNull();
    expect(quantityProblem('0,0005', litro)).toBe('invalid');
    expect(quantityProblem('12', par)).toBeNull();
  });
});
