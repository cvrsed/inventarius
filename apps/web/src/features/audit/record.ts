import type { AuditEntryDto } from '@inventarius/shared';
import type { RouteLocationRaw } from 'vue-router';

const CATALOG_SECTIONS: Record<string, string> = {
  category: 'categories',
  manufacturer: 'manufacturers',
  model: 'models',
  location: 'locations',
  status_label: 'statuses',
};

/**
 * A dónde lleva el registro de una auditoría, o `null` si no hay a dónde: solo si el registro todavía existe y está
 * vigente (`entityLinkable`). Los activos tienen ficha; el catálogo, su sección con el nombre buscado; los usuarios y
 * los roles, su listado.
 */
export function recordLink(entry: AuditEntryDto): RouteLocationRaw | null {
  if (!entry.entityLinkable || !entry.entityId) return null;
  if (entry.entity === 'asset') return { name: 'asset', params: { id: entry.entityId } };
  const section = CATALOG_SECTIONS[entry.entity];
  if (section) {
    return {
      name: 'catalog',
      params: { section },
      ...(entry.entityLabel ? { query: { q: entry.entityLabel } } : {}),
    };
  }
  if (entry.entity === 'user') return { name: 'users' };
  if (entry.entity === 'role') return { name: 'roles' };
  return null;
}
