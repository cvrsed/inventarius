import { dashboardSummarySchema } from '@inventarius/shared';
import { useQuery } from '@tanstack/vue-query';
import { api } from '@/shared/api/http';

/** Resumen del Inicio (RF-28): un solo pedido con todo agregado en el servidor. */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => api('/api/v1/dashboard', dashboardSummarySchema, { signal }),
  });
}
