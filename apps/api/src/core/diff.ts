import { isDeepStrictEqual } from 'node:util';

/**
 * Diferencia entre dos fotos de una entidad: solo los campos que cambiaron, antes y después.
 * Devuelve `null` si nada cambió. Es el formato de `audit_log.diff` y alimenta el historial (RF-24).
 */
export function changedFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
): { before: Partial<T>; after: Partial<T> } | null {
  const b: Partial<T> = {};
  const a: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (!isDeepStrictEqual(before[key], after[key])) {
      b[key] = before[key];
      a[key] = after[key];
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}
