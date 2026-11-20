/** Lo que hace falta de un consumible para saber por qué está bajo su mínimo. */
export interface LowStockFacts {
  belowMinimum: boolean;
  warehousesBelowMinimum: number;
}

type Translate = (key: string, params?: Record<string, unknown>, plural?: number) => string;

/**
 * Por qué un consumible está «bajo mínimo» (P9): el total bajo el mínimo global, o cuántas bodegas están bajo el suyo.
 * Sin esto, «27 unidades» junto a «Bajo mínimo» con mínimo 20 parece un error: era una bodega, no el total.
 */
export function lowStockReasons(c: LowStockFacts, t: Translate): string[] {
  const reasons: string[] = [];
  if (c.belowMinimum) reasons.push(t('consumables.lowGlobal'));
  if (c.warehousesBelowMinimum > 0) {
    reasons.push(
      t('consumables.lowWarehouses', { n: c.warehousesBelowMinimum }, c.warehousesBelowMinimum),
    );
  }
  return reasons;
}

/** Los motivos en una sola línea para una insignia. */
export const lowStockLabel = (c: LowStockFacts, t: Translate): string =>
  lowStockReasons(c, t).join(' · ');
