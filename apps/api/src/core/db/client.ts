import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  pool: Pool;
  db: Database;
  close(): Promise<void>;
}

/** Abre un pool de Postgres y el cliente Drizzle asociado. */
export function createDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString, max: 10 });
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
