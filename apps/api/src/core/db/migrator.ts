import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PgBoss } from 'pg-boss';
import { ALL_QUEUES } from '../queues.js';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../drizzle', import.meta.url));

/**
 * Aplica las migraciones SQL versionadas e instala el esquema de pg-boss.
 * Corre con el usuario migrador (DDL); el usuario de la app solo recibe DML y los permisos de cola.
 */
export async function runMigrations(migrationUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: migrationUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }

  const boss = new PgBoss({ connectionString: migrationUrl, supervise: false, schedule: false });
  boss.on('error', () => undefined);
  await boss.start();
  for (const queue of ALL_QUEUES) await boss.createQueue(queue);
  await boss.stop({ graceful: false });

  await grantAppAccess(migrationUrl);
}

/** Usuario de BD que usan la API y el worker en runtime (sección 10.1: solo DML). */
export const APP_ROLE = 'inventarius_app';

/**
 * Otorga al usuario de la app DML sobre las tablas de negocio y de la cola, y lo deja como
 * privilegio por defecto para tablas futuras. Si el rol no existe (p. ej. un entorno de un solo usuario)
 * no hace nada.
 */
async function grantAppAccess(migrationUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: migrationUrl, max: 1 });
  try {
    await pool.query(`
      DO $do$
      DECLARE s text;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN RETURN; END IF;
        FOREACH s IN ARRAY ARRAY['public', 'pgboss'] LOOP
          EXECUTE format('GRANT USAGE ON SCHEMA %I TO ${APP_ROLE}', s);
          EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO ${APP_ROLE}', s);
          EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO ${APP_ROLE}', s);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE}', s);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE}', s);
        END LOOP;
        -- audit_log es append-only: lo último que se hace, para que ningún GRANT genérico lo reabra (RF-30).
        IF to_regclass('public.audit_log') IS NOT NULL THEN
          REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_log FROM ${APP_ROLE};
        END IF;
      END
      $do$;
    `);
  } finally {
    await pool.end();
  }
}
