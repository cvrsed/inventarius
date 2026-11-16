import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { auditEntrySchema, pageOf } from '@inventarius/shared';
import { computed, type Ref } from 'vue';
import { api } from '@/shared/api/http';

export interface AuditQuery {
  page: number;
  pageSize: number;
  entity: string;
  action: string;
  from: string;
  to: string;
}

const auditPage = pageOf(auditEntrySchema);

/** Las fechas llegan como `YYYY-MM-DD` (hora local del navegador) y se envían como instantes UTC. */
function dayBoundary(day: string, end: boolean): string {
  return new Date(`${day}T${end ? '23:59:59.999' : '00:00:00'}`).toISOString();
}

export function useAuditList(params: Ref<AuditQuery>) {
  return useQuery({
    queryKey: computed(() => ['audit', params.value] as const),
    queryFn: ({ signal }) => {
      const p = params.value;
      const qs = new URLSearchParams({ page: String(p.page), pageSize: String(p.pageSize) });
      if (p.entity) qs.set('entity', p.entity);
      if (p.action) qs.set('action', p.action);
      if (p.from) qs.set('from', dayBoundary(p.from, false));
      if (p.to) qs.set('to', dayBoundary(p.to, true));
      return api(`/api/v1/audit?${qs}`, auditPage, { signal });
    },
    placeholderData: keepPreviousData,
  });
}
