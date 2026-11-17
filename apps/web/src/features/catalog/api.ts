import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  assetModelSchema,
  categorySchema,
  locationSchema,
  manufacturerSchema,
  pageOf,
  statusLabelSchema,
  type AssetModelDto,
  type CategoryDto,
  type LocationDto,
  type ManufacturerDto,
  type StatusLabelDto,
} from '@inventarius/shared';
import { computed, type Ref } from 'vue';
import type { z } from 'zod';
import { api } from '@/shared/api/http';
import type { RemoteOption } from '@/shared/ui/RemoteSelect.vue';
import type { Section } from './entities';

export type CatalogItem =
  CategoryDto | ManufacturerDto | AssetModelDto | LocationDto | StatusLabelDto;

const PATHS: Record<Section, string> = {
  categories: 'categories',
  manufacturers: 'manufacturers',
  models: 'models',
  locations: 'locations',
  statuses: 'status-labels',
};

const SCHEMAS: Record<Section, z.ZodType<CatalogItem>> = {
  categories: categorySchema,
  manufacturers: manufacturerSchema,
  models: assetModelSchema,
  locations: locationSchema,
  statuses: statusLabelSchema,
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
        `/api/v1/${path}?${qs({ page, pageSize, q, active, withUsage: 'true' })}`,
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

/** Etiqueta con la que una opción se muestra en un selector (las ubicaciones, con su ruta completa). */
function optionOf(section: Section, item: CatalogItem): RemoteOption {
  switch (section) {
    case 'locations':
      return { id: item.id, name: (item as LocationDto).path };
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
    case 'statuses':
      return { id: item.id, name: item.name, isSystem: (item as StatusLabelDto).isSystem };
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
    `/api/v1/${PATHS[section]}?${qs({ pageSize: 30, q, sort: 'name', ...(opts.all ? {} : { active: 'true' }), ...opts.extra })}`,
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
        api(base(), SCHEMAS[section.value], { method: 'POST', body }),
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
