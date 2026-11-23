import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOptions } from '@/features/catalog/api';
import { assetFilterDefs } from './assetFilters';

vi.mock('@/features/catalog/api', () => ({
  fetchOptions: vi.fn(async () => []),
  fetchOptionById: vi.fn(async () => null),
}));
beforeEach(() => vi.mocked(fetchOptions).mockClear());

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

describe('«Bodega base» (U2)', () => {
  it('se llama «Bodega base» y solo ofrece bodegas', async () => {
    const def = byKey('baseLocationId');
    expect(def.label).toBe('assets.filterBaseLocation');
    if (def.kind !== 'remote') throw new Error('debe ser remoto');
    await def.fetcher('anexo');
    expect(fetchOptions).toHaveBeenCalledWith('locations', 'anexo', {
      all: true,
      extra: { type: 'warehouse' },
    });
  });

  it('«Ubicación actual» ofrece todas las ubicaciones, sin restringir el tipo', async () => {
    const def = byKey('locationId');
    if (def.kind !== 'remote') throw new Error('debe ser remoto');
    await def.fetcher('chile');
    expect(fetchOptions).toHaveBeenCalledWith('locations', 'chile', { all: true });
  });

  it('cada filtro usa su propia fuente en la caché de consultas', () => {
    const sources = ['locationId', 'baseLocationId'].map((k) => {
      const d = byKey(k);
      return d.kind === 'remote' ? d.source : '';
    });
    expect(new Set(sources).size).toBe(2);
  });
});
