import { fetchOptionById, fetchOptions } from '@/features/catalog/api';
import type { Section } from '@/features/catalog/entities';
import type { FilterDef, FilterOption } from '@/shared/filters/types';
import { fetchAssigneeById, fetchAssignees } from './api';

type Translate = (key: string) => string;

const catalog = (
  key: string,
  section: Section,
  label: string,
  placement: 'bar' | 'more',
  barLabel?: string,
  searchPlaceholder?: string,
  /** Filtros extra de la búsqueda (p. ej. solo bodegas) y nombre propio de la fuente en la caché. */
  restrict?: { source: string; extra: Record<string, string> },
): FilterDef => ({
  kind: 'remote',
  key,
  label,
  placement,
  ...(barLabel ? { barLabel } : {}),
  ...(searchPlaceholder ? { searchPlaceholder } : {}),
  source: restrict?.source ?? section,
  fetcher: (q) =>
    fetchOptions(section, q, { all: true, ...(restrict ? { extra: restrict.extra } : {}) }),
  resolve: (id) => fetchOptionById(section, id),
});

/**
 * Filtros del listado de activos (RF-22). En la barra de escritorio van Estado, Categoría y Ubicación actual; el resto,
 * tras «+ Filtros». En móvil todos van al panel inferior.
 */
export function assetFilterDefs(t: Translate): FilterDef[] {
  const options = (keys: string[], prefix: string): FilterOption[] =>
    keys.map((value) => ({ value, label: t(`${prefix}.${value}`) }));
  return [
    catalog(
      'statusId',
      'statuses',
      t('assets.filterStatus'),
      'bar',
      undefined,
      t('filters.search.statuses'),
    ),
    catalog(
      'categoryId',
      'categories',
      t('assets.filterCategory'),
      'bar',
      undefined,
      t('filters.search.categories'),
    ),
    catalog(
      'locationId',
      'locations',
      t('assets.filterLocation'),
      'bar',
      undefined,
      t('filters.search.locations'),
    ),
    catalog(
      'modelId',
      'models',
      t('assets.filterModel'),
      'more',
      undefined,
      t('filters.search.models'),
    ),
    catalog(
      'baseLocationId',
      'locations',
      t('assets.filterBaseLocation'),
      'more',
      undefined,
      t('filters.search.locations'),
      { source: 'warehouses', extra: { type: 'warehouse' } },
    ),
    {
      kind: 'remote',
      key: 'assignedUserId',
      label: t('assets.filterAssignee'),
      placement: 'more',
      searchPlaceholder: t('filters.search.people'),
      source: 'assignee',
      fetcher: fetchAssignees,
      resolve: fetchAssigneeById,
    },
    {
      kind: 'choice',
      key: 'statusKind',
      label: t('assets.filterStatusKind'),
      placement: 'more',
      options: options(
        ['deployable', 'pending', 'undeployable', 'archived'],
        'assets.statusKindOptions',
      ),
    },
    {
      kind: 'choice',
      key: 'assigned',
      label: t('assets.filterAssigned'),
      placement: 'more',
      options: options(['yes', 'no'], 'assets.assignedOptions'),
    },
    {
      kind: 'choice',
      key: 'lnsStatus',
      label: t('assets.filterLnsStatus'),
      placement: 'more',
      options: options(
        ['none', 'registering', 'registered', 'error', 'partial', 'conflict', 'deregistering'],
        'assets.lnsStatusOptions',
      ),
    },
    {
      kind: 'choice',
      key: 'overdue',
      label: t('assets.filterOverdue'),
      placement: 'more',
      options: [{ value: 'true', label: t('assets.overdueOption') }],
    },
    {
      kind: 'choice',
      key: 'deleted',
      label: t('assets.filterDeleted'),
      placement: 'more',
      defaultValue: 'exclude',
      options: options(['exclude', 'include', 'only'], 'assets.deletedOptions'),
    },
  ];
}
