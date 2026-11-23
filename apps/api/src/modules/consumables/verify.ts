import type { LedgerMismatch } from './repository.js';

/** Texto del informe de cuadratura del CLI: una línea por saldo que no es igual a la suma del libro. */
export function describeLedgerReport(mismatches: LedgerMismatch[]): string {
  if (!mismatches.length) return 'Cuadra: cada saldo es igual a la suma del libro de movimientos.';
  const lines = mismatches.map(
    (m) =>
      `  consumible ${m.consumableId}, bodega ${m.locationId}: saldo ${m.stock}, libro ${m.ledger}`,
  );
  return [
    `No cuadra: ${mismatches.length} saldo(s) distinto(s) de la suma del libro.`,
    ...lines,
  ].join('\n');
}
