import { describe, expect, it } from 'vitest';
import {
  assetFiltersSchema,
  assetSortSchema,
  checkoutRequestSchema,
  createAssetSchema,
  updateAssetSchema,
} from './assets.js';
import {
  catalogListQuerySchema,
  createCategorySchema,
  createLocationSchema,
  createModelSchema,
  updateCategorySchema,
  updateLocationSchema,
  updateManufacturerSchema,
  updateModelSchema,
  updateStatusLabelSchema,
} from './catalog.js';
import { assetListQuerySchema } from './assets.js';
import { pageOf } from './identity.js';
import { z } from 'zod';

const id = '018f0000-0000-7000-8000-000000000001';
const id2 = '018f0000-0000-7000-8000-000000000002';

describe('esquemas de activos (RF-20, RF-22, RF-23)', () => {
  it('el alta exige nombre, modelo y estado; lo opcional queda en null', () => {
    const parsed = createAssetSchema.parse({ name: ' Sensor ', modelId: id, statusId: id2 });
    expect(parsed).toMatchObject({ name: 'Sensor', serial: null, locationId: null, notes: null });
    expect(createAssetSchema.safeParse({ modelId: id, statusId: id2 }).success).toBe(false);
  });

  it('la etiqueta solo admite caracteres seguros', () => {
    const base = { name: 'x', modelId: id, statusId: id2 };
    expect(createAssetSchema.safeParse({ ...base, assetTag: 'INV-000123' }).success).toBe(true);
    expect(createAssetSchema.safeParse({ ...base, assetTag: 'a b' }).success).toBe(false);
    expect(createAssetSchema.safeParse({ ...base, assetTag: '<script>' }).success).toBe(false);
  });

  it('el costo admite dos decimales y no es negativo', () => {
    const base = { name: 'x', modelId: id, statusId: id2 };
    expect(createAssetSchema.safeParse({ ...base, purchaseCost: 1234.5 }).success).toBe(true);
    expect(createAssetSchema.safeParse({ ...base, purchaseCost: -1 }).success).toBe(false);
    expect(createAssetSchema.safeParse({ ...base, purchaseCost: 1.234 }).success).toBe(false);
  });

  it('un texto vacío opcional se guarda como null', () => {
    const parsed = updateAssetSchema.parse({ serial: '  ', notes: '' });
    expect(parsed).toEqual({ serial: null, notes: null });
    expect(updateAssetSchema.safeParse({}).success).toBe(false);
  });

  it('el check-out exige usuario o ubicación, exactamente uno', () => {
    expect(checkoutRequestSchema.safeParse({ userId: id }).success).toBe(true);
    expect(checkoutRequestSchema.safeParse({ locationId: id }).success).toBe(true);
    expect(checkoutRequestSchema.safeParse({}).success).toBe(false);
    expect(checkoutRequestSchema.safeParse({ userId: id, locationId: id2 }).success).toBe(false);
  });

  it('el orden acepta solo columnas conocidas y `-` para descender', () => {
    expect(assetSortSchema.parse('-name')).toEqual({ key: 'name', desc: true });
    expect(assetSortSchema.parse('assetTag')).toEqual({ key: 'assetTag', desc: false });
    expect(assetSortSchema.safeParse('password; drop table').success).toBe(false);
  });

  it('los filtros excluyen eliminados por defecto', () => {
    expect(assetFiltersSchema.parse({}).deleted).toBe('exclude');
    expect(assetFiltersSchema.safeParse({ statusId: 'no-uuid' }).success).toBe(false);
  });
});

describe('esquemas del catálogo (RF-10 a RF-13)', () => {
  it('modelo: campos LoRaWAN opcionales con valores por defecto null', () => {
    const parsed = createModelSchema.parse({ name: 'SDM530', manufacturerId: id, categoryId: id2 });
    expect(parsed).toMatchObject({ lorawanClass: null, lorawanVersion: null, modelNumber: null });
    expect(
      createModelSchema.safeParse({
        name: 'x',
        manufacturerId: id,
        categoryId: id2,
        lorawanClass: 'Z',
      }).success,
    ).toBe(false);
  });

  it('ubicación: el padre es opcional', () => {
    expect(createLocationSchema.parse({ name: 'Edificio' })).toMatchObject({
      parentId: null,
      address: null,
    });
  });

  it('estado: el tipo debe ser uno de los cuatro', () => {
    expect(updateStatusLabelSchema.safeParse({ kind: 'deployable' }).success).toBe(true);
    expect(updateStatusLabelSchema.safeParse({ kind: 'otro' }).success).toBe(false);
  });

  it('las ediciones exigen al menos un campo', () => {
    for (const schema of [
      updateCategorySchema,
      updateManufacturerSchema,
      updateModelSchema,
      updateLocationSchema,
      updateStatusLabelSchema,
    ]) {
      expect(schema.safeParse({}).success).toBe(false);
    }
    expect(updateCategorySchema.safeParse({ active: false }).success).toBe(true);
  });

  it('un texto opcional vacío se guarda como null y la categoría parte sin extensión', () => {
    expect(updateLocationSchema.parse({ address: '   ' })).toEqual({ address: null });
    expect(updateLocationSchema.parse({ address: ' Calle 1 ' })).toEqual({ address: 'Calle 1' });
    expect(updateAssetSchema.parse({ serial: ' SN-1 ' })).toEqual({ serial: 'SN-1' });
    expect(createCategorySchema.parse({ name: 'X' }).extension).toBe('none');
  });

  it('el filtro active de los listados llega como booleano', () => {
    expect(catalogListQuerySchema.parse({ active: 'true' }).active).toBe(true);
    expect(catalogListQuerySchema.parse({ active: 'false' }).active).toBe(false);
    expect(catalogListQuerySchema.parse({}).active).toBeUndefined();
    expect(catalogListQuerySchema.safeParse({ active: 'quizá' }).success).toBe(false);
  });
});

describe('consulta del listado de activos', () => {
  it('acepta un orden válido y rechaza uno desconocido', () => {
    expect(assetListQuerySchema.safeParse({ sort: '-purchaseDate' }).success).toBe(true);
    expect(assetListQuerySchema.safeParse({ sort: 'otraCosa' }).success).toBe(false);
  });

  it('pagina con tamaño máximo de 100 (RNF-06)', () => {
    expect(assetListQuerySchema.parse({}).pageSize).toBe(25);
    expect(assetListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });
});

describe('pageOf', () => {
  it('envuelve un esquema en { data, meta }', () => {
    const schema = pageOf(z.object({ id: z.string() }));
    expect(
      schema.safeParse({ data: [{ id: 'a' }], meta: { page: 1, pageSize: 25, total: 1 } }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ data: [{ id: 1 }], meta: { page: 1, pageSize: 25, total: 1 } }).success,
    ).toBe(false);
  });
});
