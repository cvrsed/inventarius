import {
  connectionCheckSchema,
  lnsProfileSchema,
  pageOf,
  type LnsProfileDto,
} from '@inventarius/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, type Ref } from 'vue';
import { api } from '@/shared/api/http';

export function useLnsProfiles(page: Ref<number>) {
  return useQuery({
    queryKey: computed(() => ['lns-profiles', 'list', page.value] as const),
    queryFn: ({ signal }) =>
      api(`/api/v1/lns-profiles?page=${page.value}&pageSize=25`, pageOf(lnsProfileSchema), {
        signal,
      }),
  });
}

export function useLnsProfileMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['lns-profiles'] });
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        api('/api/v1/lns-profiles', lnsProfileSchema, { method: 'POST', body }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { profile: LnsProfileDto; body: Record<string, unknown> }) =>
        api(`/api/v1/lns-profiles/${v.profile.id}`, lnsProfileSchema, {
          method: 'PATCH',
          body: v.body,
          ifMatch: v.profile.updatedAt,
        }),
      onSuccess: refresh,
      onError: refresh,
    }),
    remove: useMutation({
      mutationFn: (p: LnsProfileDto) =>
        api(`/api/v1/lns-profiles/${p.id}`, lnsProfileSchema.nullable(), { method: 'DELETE' }),
      onSuccess: refresh,
    }),
    test: useMutation({
      mutationFn: (p: LnsProfileDto) =>
        api(`/api/v1/lns-profiles/${p.id}/test`, connectionCheckSchema, { method: 'POST' }),
    }),
  };
}
