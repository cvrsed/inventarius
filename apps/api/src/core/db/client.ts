import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { DEFAULT_DB_TIMEOUTS, type DbTimeouts } from './timeouts.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  pool: Pool;
  db: Database;
  close(): Promise<void>;
}

/** Abre un pool de Postgres y el cliente Drizzle asociado. */
export function createDb(
  connectionString: string,
  timeouts: DbTimeouts = DEFAULT_DB_TIMEOUTS,
): DbHandle {
  const pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: timeouts.connectionTimeoutMs,
    statement_timeout: timeouts.statementTimeoutMs,
    idle_in_transaction_session_timeout: timeouts.idleInTransactionTimeoutMs,
  });
  // Un cliente inactivo que Postgres cierra (reinicio, `pg_terminate_backend`) emite `error` en el pool; sin
  // oyente tumba el proceso. El pool descarta ese cliente y abre otro cuando hace falta.
  pool.on('error', () => undefined);
  return { pool, db: drizzle(pool, { schema }), close: () => pool.end() };
}

/** Sonda de BD: una consulta trivial. */
export async function pingDatabase(pool: Pool): Promise<boolean> {
  await pool.query('SELECT 1');
  return true;
}

/**
 * Sonda de cola: el esquema de pg-boss existe (lo instala el paso de migración, ver `migrate.ts`).
 * No se arranca pg-boss en la API: solo se verifica que la cola está disponible para el worker.
 */
export async function pingQueue(pool: Pool): Promise<boolean> {
  const res = await pool.query<{ ok: boolean }>(
    "SELECT to_regclass('pgboss.job') IS NOT NULL AS ok",
  );
  return res.rows[0]?.ok === true;
}
