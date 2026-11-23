import { describe, expect, it } from 'vitest';
import { assetFilterDefs } from './assetFilters';

const defs = assetFilterDefs((key) => key);
const byKey = (key: string) => defs.find((d) => d.key === key)!;

describe('filtros de ubicación del listado de activos (U1)', () => {
  it('«Ubicación actual» es el filtro de ubicación de la barra', () => {
    const bar = defs.filter((d) => d.placement === 'bar').map((d) => d.key);
    expect(bar).toEqual(['statusId', 'categoryId', 'locationId']);
    expect(byKey('locationId').label).toBe('assets.filterLocation');
  });

  it('la bodega base pasa a «Más filtros»', () => {
    expect(byKey('baseLocationId').placement).toBe('more');
  });
});
