import type { DashboardSummary, Permission, StatusKind } from '@inventarius/shared';
import type { RouteLocationRaw } from 'vue-router';

/** Enlace al listado de activos con un filtro aplicado (los mismos nombres que usa la URL del listado). */
export const toAssets = (query: Record<string, string> = {}): RouteLocationRaw => ({
  name: 'assets',
  query,
});

/** Destinos de cada número o barra del Inicio. */
export const links = {
  total: () => toAssets(),
  available: () => toAssets({ statusKind: 'deployable', assigned: 'no' }),
  assigned: () => toAssets({ assigned: 'yes' }),
  pendingSetup: () => toAssets({ statusKind: 'pending' }),
  statusKind: (kind: StatusKind) => toAssets({ statusKind: kind }),
  category: (id: string) => toAssets({ categoryId: id }),
  warehouse: (id: string) =>
    toAssets({ baseLocationId: id, statusKind: 'deployable', assigned: 'no' }),
  overdue: () => toAssets({ overdue: 'true' }),
};

/**
 * El técnico de campo asigna pero no edita: su Inicio es «mis equipos», no los totales de la empresa.
 * Se decide por permisos, no por el nombre del rol, para que renombrarlo no cambie la pantalla.
 */
export const isFieldTech = (can: (p: Permission) => boolean): boolean =>
  can('asset:checkout') && !can('asset:write');

/** `true` solo cuando de verdad no hay activos vigentes (no mientras carga ni con datos). */
export const hasNoAssets = (summary: DashboardSummary | undefined): boolean =>
  summary !== undefined && summary.totals.total === 0;
