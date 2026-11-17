import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/vue-query';
import {
  assetListItemSchema,
  assetSchema,
  assigneeSchema,
  batchAssetsResultSchema,
  auditEntrySchema,
  pageOf,
  type AssetDto,
} from '@inventarius/shared';
import { computed, type Ref } from 'vue';
import { z } from 'zod';
import { api } from '@/shared/api/http';
import type { RemoteOption } from '@/shared/ui/RemoteSelect.vue';

/** Estado del listado; vive en la URL (RF-22), por eso todo son textos y números simples. */
export const ASSET_LIST_DEFAULTS = {
  page: 1,
  pageSize: 25,
  q: '',
  sort: 'assetTag',
  statusId: '',
  categoryId: '',
  modelId: '',
  locationId: '',
  assignedUserId: '',
  baseLocationId: '',
  /** Tipo de estado (`deployable`, `pending`...), no su nombre. */
  statusKind: '',
  /** `yes` | `no`. */
  assigned: '',
  /** `true`: devolución esperada vencida. */
  overdue: '',
  deleted: 'exclude',
};
export type AssetListState = typeof ASSET_LIST_DEFAULTS;

/** Parámetros de la API: solo lo que se aparta del valor por defecto. */
export function listParams(s: AssetListState, includePaging = true): URLSearchParams {
  const p = new URLSearchParams();
  if (includePaging) {
    p.set('page', String(s.page));
    p.set('pageSize', String(s.pageSize));
  }
  for (const key of [
    'q',
    'sort',
    'statusId',
    'categoryId',
    'modelId',
    'locationId',
    'assignedUserId',
    'baseLocationId',
    'statusKind',
    'assigned',
    'overdue',
  ] as const) {
    if (s[key]) p.set(key, s[key]);
  }
  if (s.deleted !== 'exclude') p.set('deleted', s.deleted);
  return p;
}

export function useAssetsList(state: Ref<AssetListState>) {
  return useQuery({
    queryKey: computed(() => ['assets', 'list', state.value] as const),
    queryFn: ({ signal }) =>
      api(`/api/v1/assets?${listParams(state.value)}`, pageOf(assetListItemSchema), { signal }),
    placeholderData: keepPreviousData,
  });
}

/** Enlace de descarga del CSV con los mismos filtros (RF-26); es una navegación GET con la cookie de sesión. */
export const exportUrl = (s: AssetListState): string =>
  `/api/v1/assets/export?${listParams(s, false)}`;

export function useAsset(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => ['asset', id.value] as const),
    queryFn: ({ signal }) => api(`/api/v1/assets/${id.value}`, assetSchema, { signal }),
    // Sin id (formulario de alta) no hay nada que pedir.
    enabled: computed(() => id.value !== ''),
  });
}

const HISTORY_PAGE_SIZE = 10;

/** Historial del activo de a 10 movimientos; «Ver más» pide la página siguiente a la API. */
export function useAssetHistory(id: Ref<string>) {
  return useInfiniteQuery({
    queryKey: computed(() => ['asset', id.value, 'history'] as const),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      api(
        `/api/v1/assets/${id.value}/history?page=${pageParam}&pageSize=${HISTORY_PAGE_SIZE}`,
        pageOf(auditEntrySchema),
        { signal },
      ),
    getNextPageParam: (last) =>
      last.meta.page * last.meta.pageSize < last.meta.total ? last.meta.page + 1 : undefined,
  });
}

export async function fetchAssignees(q: string): Promise<RemoteOption[]> {
  return api(`/api/v1/assignees?${new URLSearchParams(q ? { q } : {})}`, z.array(assigneeSchema));
}

export function useAssigneeById(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => ['remote-by-id', 'assignee', id.value] as const),
    queryFn: async () =>
      (await api(`/api/v1/assignees?id=${id.value}`, z.array(assigneeSchema)))[0] ?? null,
    enabled: computed(() => id.value !== ''),
    staleTime: 60_000,
  });
}

export function useAssetMutations() {
  const qc = useQueryClient();
  const refresh = (id?: string) => async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['assets'] }),
      qc.invalidateQueries({ queryKey: id ? ['asset', id] : ['asset'] }),
    ]);
  };
  const post = <T>(id: string, action: string, body: T) =>
    api(`/api/v1/assets/${id}/${action}`, assetSchema, { method: 'POST', body });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api('/api/v1/assets', assetSchema, { method: 'POST', body }),
      onSuccess: refresh(),
    }),
    createBatch: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api('/api/v1/assets/batch', batchAssetsResultSchema, { method: 'POST', body }),
      onSuccess: refresh(),
    }),
    update: useMutation({
      mutationFn: (v: { asset: AssetDto; body: Record<string, unknown> }) =>
        api(`/api/v1/assets/${v.asset.id}`, assetSchema, {
          method: 'PATCH',
          body: v.body,
          ifMatch: v.asset.updatedAt,
        }),
      onSuccess: (_d, v) => refresh(v.asset.id)(),
      onError: (_e, v) => refresh(v.asset.id)(),
    }),
    checkout: useMutation({
      mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
        post(v.id, 'checkout', v.body),
      onSuccess: (_d, v) => refresh(v.id)(),
    }),
    checkin: useMutation({
      mutationFn: (v: { id: string; body: Record<string, unknown> }) =>
        post(v.id, 'checkin', v.body),
      onSuccess: (_d, v) => refresh(v.id)(),
    }),
    remove: useMutation({
      mutationFn: (v: { id: string; reason: string }) =>
        api(`/api/v1/assets/${v.id}`, z.null(), { method: 'DELETE', body: { reason: v.reason } }),
      onSuccess: (_d, v) => refresh(v.id)(),
    }),
    restore: useMutation({
      mutationFn: (id: string) =>
        api(`/api/v1/assets/${id}/restore`, assetSchema, { method: 'POST' }),
      onSuccess: (_d, id) => refresh(id)(),
    }),
  };
}
