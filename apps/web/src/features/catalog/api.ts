import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  assetModelSchema,
  categorySchema,
  locationSchema,
  manufacturerSchema,
  measureUnitSchema,
  pageOf,
  statusLabelSchema,
  type AssetModelDto,
  type CategoryDto,
  type LocationDto,
  type ManufacturerDto,
  type MeasureUnitDto,
  type StatusLabelDto,
} from '@inventarius/shared';
import { computed, type Ref } from 'vue';
import type { z } from 'zod';
import { api } from '@/shared/api/http';
import type { RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import type { Section } from './entities';

export type CatalogItem =
  CategoryDto | ManufacturerDto | AssetModelDto | LocationDto | StatusLabelDto | MeasureUnitDto;

const PATHS: Record<Section, string> = {
  categories: 'categories',
  manufacturers: 'manufacturers',
  models: 'models',
  locations: 'locations',
  statuses: 'status-labels',
  consumableCategories: 'categories',
  units: 'measure-units',
};

/** Las categorías de activos y las de consumibles comparten tabla: cada sección pide solo las suyas. */
const SCOPES: Partial<Record<Section, string>> = {
  categories: 'asset',
  consumableCategories: 'consumable',
};

const SCHEMAS: Record<Section, z.ZodType<CatalogItem>> = {
  categories: categorySchema,
  manufacturers: manufacturerSchema,
  models: assetModelSchema,
  locations: locationSchema,
  statuses: statusLabelSchema,
  consumableCategories: categorySchema,
  units: measureUnitSchema,
};

export interface CatalogQuery {
  page: number;
  pageSize: number;
  q: string;
  /** `''` = todos, `true` = solo activos, `false` = solo inactivos. */
  active: string;
}

function qs(params: Record<string, string | number | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== '') out.set(k, String(v));
  return out.toString();
}

export function useCatalogList(section: Ref<Section>, query: Ref<CatalogQuery>) {
  return useQuery({
    queryKey: computed(() => ['catalog', section.value, query.value] as const),
    queryFn: ({ signal }) => {
      const { page, pageSize, q, active } = query.value;
      const path = PATHS[section.value];
      return api(
        `/api/v1/${path}?${qs({ page, pageSize, q, active, withUsage: 'true', scope: SCOPES[section.value] })}`,
        pageOf(SCHEMAS[section.value]),
        { signal },
      );
    },
    // Al paginar o buscar se conserva la página anterior para no parpadear, pero NUNCA la de otra sección: sus
    // filas tienen otra forma y la plantilla de la sección nueva las leería mal (y, con un `TypeError` al
    // renderizar, dejaba la vista congelada). El segundo elemento de la clave es la sección.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === section.value ? previous : undefined,
  });
}

/** Opción de un selector. Las ubicaciones llevan `description` con la ruta de sus padres (segunda línea). */
function optionOf(section: Section, item: CatalogItem): RemoteOption {
  switch (section) {
    case 'locations': {
      // Dos líneas: el lugar arriba y la ruta de sus padres abajo («Zensi › Chile › Santiago»).
      const loc = item as LocationDto;
      const parents = loc.path.split(' > ').slice(0, -1).join(' › ');
      return { id: item.id, name: loc.name, ...(parents ? { description: parents } : {}) };
    }
    case 'models': {
      const m = item as AssetModelDto;
      return {
        id: m.id,
        name: `${m.manufacturer.name} ${m.name}`,
        extension: m.category.extension,
      };
    }
    case 'categories':
      return { id: item.id, name: item.name, extension: (item as CategoryDto).extension };
    case 'units': {
      const u = item as MeasureUnitDto;
      return { id: u.id, name: u.name, description: u.abbreviation, decimals: u.decimals };
    }
    case 'statuses': {
      const st = item as StatusLabelDto;
      return { id: item.id, name: item.name, isSystem: st.isSystem, kind: st.kind };
    }
    default:
      return { id: item.id, name: item.name };
  }
}

/**
 * Opciones para un selector con búsqueda. Solo registros activos: lo inactivo no se elige en formularios
 * nuevos (RF-14). `all` incluye también los inactivos (filtros de listados).
 */
export async function fetchOptions(
  section: Section,
  q: string,
  opts: { all?: boolean; extra?: Record<string, string> } = {},
): Promise<RemoteOption[]> {
  const res = await api(
    `/api/v1/${PATHS[section]}?${qs({ pageSize: 30, q, sort: 'name', ...(opts.all ? {} : { active: 'true' }), scope: SCOPES[section], ...opts.extra })}`,
    pageOf(SCHEMAS[section]),
  );
  return res.data.map((i) => optionOf(section, i));
}

export function useCatalogMutations(section: Ref<Section>) {
  const qc = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['catalog'] }),
      qc.invalidateQueries({ queryKey: ['remote'] }),
    ]);
  };
  const base = () => `/api/v1/${PATHS[section.value]}`;
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api(base(), SCHEMAS[section.value], {
          method: 'POST',
          body: section.value === 'consumableCategories' ? { ...body, scope: 'consumable' } : body,
        }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { item: CatalogItem; body: Record<string, unknown> }) =>
        api(`${base()}/${v.item.id}`, SCHEMAS[section.value], {
          method: 'PATCH',
          body: v.body,
          ifMatch: v.item.updatedAt,
        }),
      onSuccess: refresh,
      onError: refresh,
    }),
    remove: useMutation({
      mutationFn: (item: CatalogItem) =>
        api(`${base()}/${item.id}`, SCHEMAS[section.value], { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}

/**
 * Resuelve el nombre de un registro a partir de su id (filtros que llegan por la URL): sin esto el selector
 * mostraría el id o quedaría vacío.
 */
export function useOptionById(section: Section, id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => ['remote-by-id', section, id.value] as const),
    queryFn: async () =>
      optionOf(section, await api(`/api/v1/${PATHS[section]}/${id.value}`, SCHEMAS[section])),
    enabled: computed(() => id.value !== ''),
    staleTime: 60_000,
  });
}

/** Opción de un id (para mostrar en un filtro lo que viene de la URL), o `null` si ya no existe. */
export async function fetchOptionById(section: Section, id: string): Promise<RemoteOption | null> {
  try {
    return optionOf(section, await api(`/api/v1/${PATHS[section]}/${id}`, SCHEMAS[section]));
  } catch {
    return null;
  }
}
