import type { DashboardSummary, Permission } from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import { hasNoAssets, isFieldTech, links } from './summary';

const summary = (total: number): DashboardSummary => ({
  totals: { total, available: 0, assigned: 0, pendingSetup: 0 },
  byStatus: [],
  byCategory: [],
  stockByWarehouse: [],
  overdue: { count: 0, items: [] },
  recent: [],
  mine: [],
});
const can =
  (...granted: Permission[]) =>
  (p: Permission) =>
    granted.includes(p);

describe('Inicio (RF-28)', () => {
  it('«no hay activos» solo con el resumen cargado y en cero', () => {
    expect(hasNoAssets(undefined)).toBe(false);
    expect(hasNoAssets(summary(0))).toBe(true);
    expect(hasNoAssets(summary(3))).toBe(false);
  });

  it('el técnico de campo se reconoce por permisos', () => {
    expect(isFieldTech(can('asset:read', 'asset:checkout'))).toBe(true);
    expect(isFieldTech(can('asset:read', 'asset:checkout', 'asset:write'))).toBe(false);
    expect(isFieldTech(can('asset:read'))).toBe(false);
  });

  it('los enlaces usan filtros por tipo de estado y no por nombre', () => {
    expect(links.pendingSetup()).toEqual({ name: 'assets', query: { statusKind: 'pending' } });
    expect(links.available()).toEqual({
      name: 'assets',
      query: { statusKind: 'deployable', assigned: 'no' },
    });
    expect(links.warehouse('w1')).toEqual({
      name: 'assets',
      query: { baseLocationId: 'w1', statusKind: 'deployable', assigned: 'no' },
    });
    expect(links.overdue()).toEqual({ name: 'assets', query: { overdue: 'true' } });
    expect(links.total()).toEqual({ name: 'assets', query: {} });
  });
});
