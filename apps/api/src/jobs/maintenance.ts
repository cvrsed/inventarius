import type { PgBoss } from 'pg-boss';

/** Cola del job que purga sesiones vencidas. Su nombre es parte del contrato con la tabla `pgboss.schedule`. */
export const PURGE_SESSIONS_QUEUE = 'maintenance-purge-sessions';
/** Todas las colas de mantenimiento; el migrador las crea (DDL) para que el worker solo necesite DML. */
export const MAINTENANCE_QUEUES = [PURGE_SESSIONS_QUEUE] as const;
/** Cada hora, en punto. */
export const PURGE_SESSIONS_CRON = '0 * * * *';

export interface MaintenanceDeps {
  /** Borra las sesiones vencidas y devuelve cuántas borró (solo para el log). */
  purgeSessions: () => Promise<number>;
  log: { info: (obj: object, msg: string) => void };
}

/**
 * Programa y atiende los jobs periódicos de mantenimiento (RF-03).
 * Es idempotente: pg-boss guarda un solo horario por cola, así que varias réplicas del worker
 * (o reinicios) no duplican la ejecución; cada hora la toma una sola instancia.
 */
export async function startMaintenanceJobs(boss: PgBoss, deps: MaintenanceDeps): Promise<void> {
  await boss.schedule(PURGE_SESSIONS_QUEUE, PURGE_SESSIONS_CRON);
  await boss.work(PURGE_SESSIONS_QUEUE, async () => {
    const deleted = await deps.purgeSessions();
    deps.log.info({ deleted }, 'sesiones vencidas purgadas');
  });
}
