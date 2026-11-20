import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/vue-query';
import {
  consumableDetailSchema,
  consumableSchema,
  locationSchema,
  movementResultSchema,
  movementSchema,
  pageOf,
  recipientSchema,
  type MovementKind,
} from '@inventarius/shared';
import { computed, type Ref } from 'vue';
import { z } from 'zod';
import { api } from '@/shared/api/http';
import type { RemoteOption } from '@/shared/ui/RemoteSelect.vue';

/** Estado del listado; vive en la URL, así que todo son textos y números simples. */
export const CONSUMABLE_LIST_DEFAULTS = {
  page: 1,
  pageSize: 25,
  q: '',
  sort: 'name',
  categoryId: '',
  /** `true` (por defecto), `false` o `all`. Los desactivados quedan fuera salvo que se pidan. */
  active: 'true',
  /** `true`: solo los que están bajo su mínimo. */
  lowStock: '',
};
export type ConsumableListState = typeof CONSUMABLE_LIST_DEFAULTS;

function listParams(s: ConsumableListState): URLSearchParams {
  const p = new URLSearchParams({ page: String(s.page), pageSize: String(s.pageSize) });
  for (const key of ['q', 'sort', 'categoryId', 'lowStock'] as const) {
    if (s[key]) p.set(key, s[key]);
  }
  if (s.active !== 'all') p.set('active', s.active);
  return p;
}

export function useConsumablesList(state: Ref<ConsumableListState>) {
  return useQuery({
    queryKey: computed(() => ['consumables', 'list', state.value] as const),
    queryFn: ({ signal }) =>
      api(`/api/v1/consumables?${listParams(state.value)}`, pageOf(consumableSchema), { signal }),
    placeholderData: keepPreviousData,
  });
}

export function useConsumable(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => ['consumables', 'detail', id.value] as const),
    queryFn: ({ signal }) =>
      api(`/api/v1/consumables/${id.value}`, consumableDetailSchema, { signal }),
    enabled: computed(() => id.value !== ''),
  });
}

/** Cuántos consumibles activos están bajo su mínimo (aviso de Inicio): solo el total, sin traer filas. */
export function useLowStockCount(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: ['consumables', 'low-count'] as const,
    queryFn: async ({ signal }) =>
      (
        await api(
          '/api/v1/consumables?lowStock=true&active=true&pageSize=1',
          pageOf(consumableSchema),
          { signal },
        )
      ).meta.total,
    enabled,
  });
}

export interface HistoryFilters {
  locationId: string;
  kind: '' | MovementKind;
  from: string;
  to: string;
}

const HISTORY_PAGE_SIZE = 10;

/** Historial de a 10 movimientos; «Ver más» pide la página siguiente. */
export function useConsumableMovements(id: Ref<string>, filters: Ref<HistoryFilters>) {
  return useInfiniteQuery({
    queryKey: computed(() => ['consumables', 'movements', id.value, filters.value] as const),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const p = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(HISTORY_PAGE_SIZE),
      });
      for (const [k, v] of Object.entries(filters.value)) if (v) p.set(k, v);
      return api(`/api/v1/consumables/${id.value}/movements?${p}`, pageOf(movementSchema), {
        signal,
      });
    },
    getNextPageParam: (last) =>
      last.meta.page * last.meta.pageSize < last.meta.total ? last.meta.page + 1 : undefined,
    enabled: computed(() => id.value !== ''),
  });
}

export async function fetchRecipients(q: string): Promise<RemoteOption[]> {
  return api(
    `/api/v1/consumable-recipients?${new URLSearchParams(q ? { q } : {})}`,
    z.array(recipientSchema),
  );
}

export function useConsumableMutations() {
  const qc = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['consumables'] }),
      qc.invalidateQueries({ queryKey: ['audit'] }),
    ]);
  };
  const post = (id: string, path: string) => (body: Record<string, unknown>) =>
    api(`/api/v1/consumables/${id}/${path}`, movementResultSchema, { method: 'POST', body });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api('/api/v1/consumables', consumableDetailSchema, { method: 'POST', body }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { id: string; version: string; body: Record<string, unknown> }) =>
        api(`/api/v1/consumables/${v.id}`, consumableDetailSchema, {
          method: 'PATCH',
          body: v.body,
          ifMatch: v.version,
        }),
      onSuccess: refresh,
      onError: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) =>
        api(`/api/v1/consumables/${id}`, z.unknown(), { method: 'DELETE' }),
      onSuccess: refresh,
    }),
    receive: useMutation({
      mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
        post(v.id, 'receipts')(v.body),
      onSuccess: refresh,
    }),
    deliver: useMutation({
      mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
        post(v.id, 'deliveries')(v.body),
      onSuccess: refresh,
    }),
    transfer: useMutation({
      mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
        post(v.id, 'transfers')(v.body),
      onSuccess: refresh,
    }),
    adjust: useMutation({
      mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
        post(v.id, 'adjustments')(v.body),
      onSuccess: refresh,
    }),
    giveBack: useMutation({
      mutationFn: (v: { deliveryId: string; body: Record<string, unknown> }) =>
        api(`/api/v1/consumable-movements/${v.deliveryId}/returns`, movementResultSchema, {
          method: 'POST',
          body: v.body,
        }),
      onSuccess: refresh,
    }),
    reverse: useMutation({
      mutationFn: (v: { movementId: string; reason: string }) =>
        api(`/api/v1/consumable-movements/${v.movementId}/reversals`, movementResultSchema, {
          method: 'POST',
          body: { reason: v.reason },
        }),
      onSuccess: refresh,
    }),
  };
}

/** Una bodega con su ruta, para los selectores de bodega (activas e inactivas: el selector dice cuáles no se pueden usar). */
export interface WarehouseInfo {
  id: string;
  name: string;
  path: string;
  /** Ruta de los padres («Zensi › Chile»), vacía si es de primer nivel. */
  parents: string;
  active: boolean;
}

/** Todas las bodegas (hasta 100, el tope de los listados; RNF-06), ordenadas por ruta. */
export function useWarehouses() {
  return useQuery({
    queryKey: ['remote', 'warehouses-all'] as const,
    queryFn: async ({ signal }): Promise<WarehouseInfo[]> => {
      const res = await api(
        '/api/v1/locations?type=warehouse&pageSize=100&sort=path',
        pageOf(locationSchema),
        { signal },
      );
      return res.data.map((l) => ({
        id: l.id,
        name: l.name,
        path: l.path,
        parents: l.path.split(' > ').slice(0, -1).join(' › '),
        active: l.active,
      }));
    },
    staleTime: 15_000,
  });
}
