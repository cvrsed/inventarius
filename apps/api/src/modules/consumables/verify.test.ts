import { describe, expect, it } from 'vitest';
import { describeLedgerReport } from './verify.js';

describe('informe de cuadratura', () => {
  it('dice que cuadra cuando no hay diferencias', () => {
    expect(describeLedgerReport([])).toContain('Cuadra');
  });

  it('lista cada saldo que no cuadra', () => {
    const text = describeLedgerReport([
      { consumableId: 'c1', locationId: 'l1', stock: '6', ledger: '5' },
    ]);
    expect(text).toContain('No cuadra: 1');
    expect(text).toContain('consumible c1, bodega l1: saldo 6, libro 5');
  });
});
