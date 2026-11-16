import { describe, expect, it } from 'vitest';
import { ConflictError, ValidationError } from '../../core/errors.js';
import {
  assertCanCheckin,
  assertCanCheckout,
  assertCanDelete,
  formatAssetTag,
  warrantyEndsOn,
} from './domain.js';

describe('formatAssetTag (D6)', () => {
  it('prefijo + correlativo de 6 dígitos', () => {
    expect(formatAssetTag('INV', 123n)).toBe('INV-000123');
    expect(formatAssetTag('ZEN', 1234567n)).toBe('ZEN-1234567');
  });
});

describe('warrantyEndsOn', () => {
  it('suma los meses a la fecha de compra', () => {
    expect(warrantyEndsOn('2026-01-15', 12)).toBe('2027-01-15');
  });
  it('ajusta al último día cuando el mes destino es más corto', () => {
    expect(warrantyEndsOn('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('sin fecha o sin meses no hay fin de garantía', () => {
    expect(warrantyEndsOn(null, 12)).toBeNull();
    expect(warrantyEndsOn('2026-01-15', null)).toBeNull();
  });
});

describe('reglas de asignación (RF-23)', () => {
  const free = { deleted: false, statusKind: 'deployable' as const, assigned: false };

  it('permite asignar un activo desplegable y libre', () => {
    expect(() => assertCanCheckout(free)).not.toThrow();
  });
  it.each(['pending', 'undeployable', 'archived'] as const)('rechaza estados %s', (statusKind) => {
    expect(() => assertCanCheckout({ ...free, statusKind })).toThrow(ValidationError);
  });
  it('rechaza un activo ya asignado y uno dado de baja', () => {
    expect(() => assertCanCheckout({ ...free, assigned: true })).toThrow(ConflictError);
    expect(() => assertCanCheckout({ ...free, deleted: true })).toThrow(ConflictError);
  });
  it('el check-in exige que esté asignado', () => {
    expect(() => assertCanCheckin({ deleted: false, assigned: true })).not.toThrow();
    expect(() => assertCanCheckin({ deleted: false, assigned: false })).toThrow(ConflictError);
  });
});

describe('baja lógica (RF-25)', () => {
  it('no se da de baja un activo asignado ni uno ya dado de baja', () => {
    expect(() => assertCanDelete({ deleted: false, assigned: false })).not.toThrow();
    expect(() => assertCanDelete({ deleted: false, assigned: true })).toThrow(ConflictError);
    expect(() => assertCanDelete({ deleted: true, assigned: false })).toThrow(ConflictError);
  });
});
