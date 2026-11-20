import {
  isPositiveQuantity,
  isQuantity,
  quantityFitsUnit,
  type UnitRef,
} from '@inventarius/shared';

export type QuantityProblem = 'required' | 'invalid' | 'zero' | 'decimals';

/** Lo que se escribe en es-CL usa coma decimal: se pasa a punto antes de validar o enviar. */
export function toApiQuantity(text: string): string {
  return text.trim().replace(',', '.');
}

/** Qué le pasa a lo escrito en un campo de cantidad, o `null` si está bien (sin float: todo con texto). */
export function quantityProblem(text: string, unit: UnitRef): QuantityProblem | null {
  const value = toApiQuantity(text);
  if (!value) return 'required';
  if (!isQuantity(value)) return 'invalid';
  if (!isPositiveQuantity(value)) return 'zero';
  if (!quantityFitsUnit(value, unit.decimals)) return 'decimals';
  return null;
}
