import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { inject } from 'vitest';
import { createDb, type DbHandle } from '../src/core/db/client.js';

export interface IsolatedDb extends DbHandle {
  appUrl: string;
  migratorUrl: string;
  /** Conexión migrador (DDL / superficie completa) para preparar o inspeccionar datos. */
  migratorPool: Pool;
  drop(): Promise<void>;
}

/** Clona la plantilla migrada en una base propia del archivo de test. */
export async function createIsolatedDb(): Promise<IsolatedDb> {
  const { host, port, adminUrl } = inject('pg');
  const name = `t_${randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query(
      `CREATE DATABASE ${name} TEMPLATE inventarius_template OWNER inventarius_migrator`,
    );
  } finally {
    await admin.end();
  }
  const appUrl = `postgres://inventarius_app:test-app@${host}:${port}/${name}`;
  const migratorUrl = `postgres://inventarius_migrator:test-migrator@${host}:${port}/${name}`;
  const handle = createDb(appUrl);
  const migratorPool = new Pool({ connectionString: migratorUrl, max: 2 });
  return {
    ...handle,
    appUrl,
    migratorUrl,
    migratorPool,
    drop: async () => {
      await handle.close();
      await migratorPool.end();
      const a = new Pool({ connectionString: adminUrl });
      try {
        await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await a.end();
      }
    },
  };
}
