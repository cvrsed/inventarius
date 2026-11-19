import { useQuery } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';
import { formatDateOnly } from '@/shared/format/format';
import type { FilterDef, FilterValues } from './types';

const valueOf = (values: FilterValues, def: FilterDef): string => String(values[def.key] ?? '');

/** Un filtro está activo cuando su valor se aparta del que significa «sin filtro». */
export const isActive = (values: FilterValues, def: FilterDef): boolean =>
  valueOf(values, def) !== (def.defaultValue ?? '');

export const activeFilters = (defs: readonly FilterDef[], values: FilterValues): FilterDef[] =>
  defs.filter((d) => isActive(values, d));

/** El estado a aplicar para dejar un filtro (o todos) sin efecto. */
export const clearPatch = (defs: readonly FilterDef[]): Record<string, string> =>
  Object.fromEntries(defs.map((d) => [d.key, d.defaultValue ?? '']));

/**
 * Texto del valor actual de un filtro, para el botón y el chip. Los remotos resuelven el nombre del id con la misma
 * consulta (cacheada) que ya hizo el menú; mientras llega se muestra una elipsis.
 */
export function useFilterValueLabel(def: FilterDef, value: Ref<string>) {
  const remote = useQuery({
    queryKey: computed(
      () => ['remote-by-id', def.kind === 'remote' ? def.source : '', value.value] as const,
    ),
    queryFn: () => (def.kind === 'remote' ? def.resolve(value.value) : Promise.resolve(null)),
    enabled: computed(() => def.kind === 'remote' && value.value !== ''),
    staleTime: 60_000,
  });
  return computed(() => {
    if (def.kind === 'choice')
      return def.options.find((o) => o.value === value.value)?.label ?? value.value;
    if (def.kind === 'date') return value.value ? formatDateOnly(value.value) : '';
    return remote.data.value?.name ?? '…';
  });
}
