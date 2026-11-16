import type { StatusKind } from '@inventarius/shared';
import { ConflictError, ValidationError } from '../../core/errors.js';

/** Etiqueta autogenerada: prefijo configurable + correlativo (D6), p. ej. `INV-000123`. */
export function formatAssetTag(prefix: string, sequence: bigint | number): string {
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

/** Fin de la garantía: compra + meses, ajustado al último día si el mes destino es más corto. */
export function warrantyEndsOn(purchaseDate: string | null, months: number | null): string | null {
  if (!purchaseDate || months === null) return null;
  const [y, m, d] = purchaseDate.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

interface AssetState {
  deleted: boolean;
  assigned: boolean;
}

/** RF-23: solo se asigna un activo vigente, libre y en estado desplegable. */
export function assertCanCheckout(a: AssetState & { statusKind: StatusKind }): void {
  if (a.deleted) throw new ConflictError('El activo está dado de baja');
  if (a.assigned) throw new ConflictError('El activo ya está asignado; devuélvelo antes');
  if (a.statusKind !== 'deployable') {
    throw new ValidationError('Solo se pueden asignar activos en un estado desplegable', {
      statusId: ['El estado actual no permite asignar el activo'],
    });
  }
}

export function assertCanCheckin(a: AssetState): void {
  if (a.deleted) throw new ConflictError('El activo está dado de baja');
  if (!a.assigned) throw new ConflictError('El activo no está asignado');
}

/** RF-25: un activo asignado se devuelve antes de darlo de baja. */
export function assertCanDelete(a: AssetState): void {
  if (a.deleted) throw new ConflictError('El activo ya está dado de baja');
  if (a.assigned)
    throw new ConflictError('El activo está asignado; devuélvelo antes de darlo de baja');
}
