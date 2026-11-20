import {
  compareQuantities,
  subtractQuantities,
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

/** Cuánto queda por devolver de una entrega: lo entregado menos las devoluciones vigentes (nunca negativo). */
export function remainingToReturn(delivered: string, returned: string): string {
  return compareQuantities(delivered, returned) <= 0
    ? '0'
    : subtractQuantities(delivered, returned);
}

/** Día calendario (`aaaa-mm-dd`) de un instante en la zona horaria dada. */
export function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
