import { readyResponseSchema, type ReadyResponse } from '@inventarius/shared';
import { useQuery } from '@tanstack/vue-query';

/**
 * Consulta `/api/health/ready`. Un 503 trae el detalle de qué componente falló, por eso se
 * valida el cuerpo igual que en un 200; solo un cuerpo ilegible se trata como error.
 */
export async function fetchReadiness(): Promise<ReadyResponse> {
  const res = await fetch('/api/health/ready', { headers: { accept: 'application/json' } });
  return readyResponseSchema.parse(await res.json());
}

export function useApiStatus() {
  return useQuery({
    queryKey: ['health', 'ready'],
    queryFn: fetchReadiness,
    refetchInterval: 30_000,
  });
}
