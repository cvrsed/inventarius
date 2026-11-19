import { describe, expect, it } from 'vitest';
import { changedFields } from './diff.js';

describe('changedFields', () => {
  it('devuelve solo los campos que cambiaron, antes y después', () => {
    const diff = changedFields(
      { name: 'A', serial: 'S1', notes: null },
      { name: 'B', serial: 'S1', notes: 'x' },
    );
    expect(diff).toEqual({ before: { name: 'A', notes: null }, after: { name: 'B', notes: 'x' } });
  });

  it('devuelve null si nada cambió', () => {
    expect(changedFields({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBeNull();
  });

  it('compara arreglos y objetos por valor', () => {
    expect(changedFields({ roles: ['a'] }, { roles: ['a', 'b'] })).toEqual({
      before: { roles: ['a'] },
      after: { roles: ['a', 'b'] },
    });
  });
});
