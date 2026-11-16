import { overallStatus, type ReadyResponse } from '@inventarius/shared';

/** Sondas de dependencias; se inyectan para poder simular fallas en tests. */
export interface HealthProbes {
  database(): Promise<boolean>;
  queue(): Promise<boolean>;
}

async function probe(fn: () => Promise<boolean>): Promise<'up' | 'down'> {
  try {
    return (await fn()) ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/** Evalúa las dependencias y devuelve el estado de readiness. */
export async function checkReadiness(probes: HealthProbes): Promise<ReadyResponse> {
  const [database, queue] = await Promise.all([probe(probes.database), probe(probes.queue)]);
  const checks = { database, queue };
  return { status: overallStatus(checks), checks };
}
