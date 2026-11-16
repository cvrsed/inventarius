import { describe, expect, it } from 'vitest';
import {
  assetFiltersSchema,
  assetSortSchema,
  checkoutRequestSchema,
  createAssetSchema,
  updateAssetSchema,
} from './assets.js';
import { createLocationSchema, createModelSchema, updateStatusLabelSchema } from './catalog.js';

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
});
