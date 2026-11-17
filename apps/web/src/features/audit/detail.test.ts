import { describe, expect, it } from 'vitest';
import { messages } from '@/app/i18n/es-CL';
import { setFormatSettings } from '@/shared/format/format';
import { describeAuditDetail, formatDetailValue, type DetailText } from './detail';

/** Resuelve «a.b.c» contra los textos reales, como vue-i18n. */
const lookup = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], messages);
const text: DetailText = {
  t: (k) => String(lookup(k)),
  te: (k) => typeof lookup(k) === 'string',
};

setFormatSettings({ timezone: 'America/Santiago', defaultCurrency: 'CLP' });

describe('describeAuditDetail (RF-31)', () => {
  it('sin diff no hay filas', () => {
    expect(describeAuditDetail(null, text)).toEqual([]);
  });

  it('antes y después: solo lo que cambió, con nombres en español', () => {
    const rows = describeAuditDetail(
      {
        before: { name: 'Ana', active: true, roles: ['Lector'] },
        after: { name: 'Ana María', active: true, roles: ['Operador', 'Lector'] },
      },
      text,
    );
    expect(rows).toEqual([
      { field: 'name', label: 'Nombre', before: 'Ana', after: 'Ana María' },
      { field: 'roles', label: 'Roles', before: 'Lector', after: 'Operador, Lector' },
    ]);
  });

  it('un alta (solo after) lista campo → valor; booleanos y vacíos en lenguaje de persona', () => {
    const rows = describeAuditDetail(
      {
        after: {
          name: 'Sensor',
          active: true,
          address: null,
          kind: 'deployable',
          type: 'warehouse',
        },
      },
      text,
    );
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ['Nombre', 'Sensor'],
      ['Activo', 'Sí'],
      ['Dirección', '—'],
      ['Tipo de estado', 'Asignable'],
      ['Tipo', 'Bodega'],
    ]);
  });

  it('una baja (solo before) y un objeto plano también se listan', () => {
    expect(describeAuditDetail({ before: { name: 'Rol X' } }, text)).toEqual([
      { field: 'name', label: 'Nombre', value: 'Rol X' },
    ]);
    expect(describeAuditDetail({ email: 'x@ejemplo.cl' }, text)).toEqual([
      { field: 'email', label: 'Correo electrónico', value: 'x@ejemplo.cl' },
    ]);
  });

  it('traduce permisos y formatea fechas', () => {
    expect(formatDetailValue('permissions', ['asset:read', 'audit:read'], text)).toBe(
      'Ver activos, Ver auditoría',
    );
    expect(formatDetailValue('purchaseDate', '2026-11-05', text)).toBe('05-11-2026');
    expect(formatDetailValue('permissions', [], text)).toBe('—');
  });

  it('un campo desconocido se muestra con su clave en lugar de perderse', () => {
    expect(describeAuditDetail({ after: { campoNuevo: 'x' } }, text)[0]).toMatchObject({
      label: 'campoNuevo',
      value: 'x',
    });
  });
});
