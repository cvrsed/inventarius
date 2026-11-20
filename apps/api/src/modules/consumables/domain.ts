import {
  compareQuantities,
  quantityFitsUnit,
  type AdjustmentInput,
  type UnitRef,
} from '@inventarius/shared';
import { ValidationError } from '../../core/errors.js';

/** Rechaza una cantidad con más decimales de los que permite la unidad de medida (D4). */
export function assertQuantityFitsUnit(quantity: string, unit: UnitRef, field: string): void {
  if (quantityFitsUnit(quantity, unit.decimals)) return;
  const allowed =
    unit.decimals === 0
      ? `sin decimales`
      : `hasta ${unit.decimals} ${unit.decimals === 1 ? 'decimal' : 'decimales'}`;
  const message = `Las cantidades en ${unit.plural} se registran ${allowed}`;
  throw new ValidationError(message, { [field]: [message] });
}

/** Un saldo está bajo su mínimo cuando es estrictamente menor; sin mínimo nunca lo está. */
export function isBelowMinimum(quantity: string, minimum: string | null): boolean {
  return minimum !== null && compareQuantities(quantity, minimum) < 0;
}

/** Cantidad con el signo que lleva en el libro. */
export function signedDelta(direction: AdjustmentInput['direction'], quantity: string): string {
  return direction === 'add' ? quantity : `-${quantity}`;
}
