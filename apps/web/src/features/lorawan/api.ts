import {
  type LinkAdoptField,
  lnsKindSchema,
  linkPreviewSchema,
  lnsRegistrationSchema,
  lorawanImportPreviewSchema,
  lorawanImportResultSchema,
  lorawanSchema,
  registrationPreviewSchema,
  revealKeysResultSchema,
} from '@inventarius/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';
import { z } from 'zod';
import { api } from '@/shared/api/http';

const profileOptionSchema = z.object({ id: z.uuid(), name: z.string(), kind: lnsKindSchema });
export type LnsProfileOption = z.infer<typeof profileOptionSchema>;

/** Estados en que el servidor está trabajando: la ficha consulta cada pocos segundos hasta que termine (RF-61). */
const BUSY = new Set(['registering', 'deregistering']);
const POLL_MS = 2000;

/** Datos LoRaWAN del activo; mientras el registro está en curso se refresca solo. */
export function useLorawan(assetId: Ref<string>, enabled: Ref<boolean>) {
  return useQuery({
    queryKey: computed(() => ['asset', assetId.value, 'lorawan'] as const),
    queryFn: ({ signal }) =>
      api(`/api/v1/assets/${assetId.value}/lorawan`, lorawanSchema, { signal }),
    enabled,
    refetchInterval: (q) => (BUSY.has(q.state.data?.registration?.status ?? '') ? POLL_MS : false),
  });
}

export function useLnsProfileOptions(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: ['lns-profiles', 'options'] as const,
    queryFn: () => api('/api/v1/lns-profiles/options', z.array(profileOptionSchema)),
    enabled,
  });
}

export function useLorawanMutations(assetId: Ref<string>) {
  const qc = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['asset', assetId.value] }),
      qc.invalidateQueries({ queryKey: ['assets'] }),
    ]);
  };
  const base = () => `/api/v1/assets/${assetId.value}`;
  return {
    update: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api(`${base()}/lorawan`, lorawanSchema, { method: 'PATCH', body }),
      onSuccess: refresh,
    }),
    // El reveal no se guarda en la caché de consultas: la respuesta vive solo en el diálogo.
    reveal: useMutation({
      mutationFn: () => api(`${base()}/lorawan/reveal`, revealKeysResultSchema, { method: 'POST' }),
      onSuccess: refresh,
      gcTime: 0,
    }),
    preview: useMutation({
      mutationFn: (profileId: string) =>
        api(`${base()}/lns-registration/preview`, registrationPreviewSchema, {
          method: 'POST',
          body: { profileId },
        }),
    }),
    // Lectura del dispositivo remoto antes de vincular; solo lectura, no se guarda nada.
    linkPreview: useMutation({
      mutationFn: () =>
        api(`${base()}/lns-registration/link-preview`, linkPreviewSchema, { method: 'POST' }),
      gcTime: 0,
    }),
    register: useMutation({
      mutationFn: (profileId: string) =>
        api(`${base()}/lns-registration`, lnsRegistrationSchema, {
          method: 'POST',
          body: { profileId },
        }),
      onSuccess: refresh,
    }),
    deregister: useMutation({
      mutationFn: () =>
        api(`${base()}/lns-registration`, lnsRegistrationSchema.nullable(), { method: 'DELETE' }),
      onSuccess: refresh,
    }),
    retry: useMutation({
      mutationFn: () =>
        api(`${base()}/lns-registration/retry`, lnsRegistrationSchema, { method: 'POST' }),
      onSuccess: refresh,
    }),
    resolve: useMutation({
      mutationFn: (vars: { action: 'link' | 'cancel'; adopt?: LinkAdoptField[] }) =>
        api(`${base()}/lns-registration/resolve`, lnsRegistrationSchema.nullable(), {
          method: 'POST',
          body: vars,
        }),
      onSuccess: refresh,
    }),
  };
}

export const previewImport = (csv: string) =>
  api('/api/v1/lorawan/import/preview', lorawanImportPreviewSchema, {
    method: 'POST',
    body: { csv },
  });

export function useApplyImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (csv: string) =>
      api('/api/v1/lorawan/import', lorawanImportResultSchema, { method: 'POST', body: { csv } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
}
