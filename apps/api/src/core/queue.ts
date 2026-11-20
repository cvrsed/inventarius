import type { PgBoss } from 'pg-boss';

/** Opciones de entrega de un job; los reintentos con espera creciente los hace la cola (RF-63). */
export interface SendOptions {
  retryLimit?: number;
  /** Segundos de espera antes del primer reintento. */
  retryDelay?: number;
  retryBackoff?: boolean;
}

/** Puerto de la cola de trabajos en segundo plano (pg-boss en producción, memoria en pruebas). */
export interface JobQueue {
  send(queue: string, data: Record<string, unknown>, options?: SendOptions): Promise<void>;
}

/** Cola sobre pg-boss (esquema `pgboss`, instalado por el migrador). */
export class PgBossQueue implements JobQueue {
  constructor(private readonly boss: PgBoss) {}

  async send(
    queue: string,
    data: Record<string, unknown>,
    options: SendOptions = {},
  ): Promise<void> {
    const id = await this.boss.send(queue, data, options);
    if (id === null) throw new Error(`pg-boss no aceptó el job de la cola ${queue}`);
  }
}
