import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/core/db/migrator.js';
import { POSTGRES_IMAGE } from './postgres.js';

let container: StartedPostgreSqlContainer | undefined;

declare module 'vitest' {
  export interface ProvidedContext {
    pg: { host: string; port: number; adminUrl: string };
  }
}

/**
 * Un Postgres 18 para toda la corrida de integración. Se migra una vez una base plantilla
 * (`inventarius_template`) y cada archivo de test clona la suya con `CREATE DATABASE ... TEMPLATE`.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const adminUrl = container.getConnectionUri();
  const admin = new Pool({ connectionString: adminUrl });
  try {
    await admin.query("CREATE ROLE inventarius_migrator LOGIN PASSWORD 'test-migrator'");
    await admin.query("CREATE ROLE inventarius_app LOGIN PASSWORD 'test-app'");
    await admin.query('CREATE DATABASE inventarius_template OWNER inventarius_migrator');
  } finally {
    await admin.end();
  }
  const host = container.getHost();
  const port = container.getPort();
  await runMigrations(
    `postgres://inventarius_migrator:test-migrator@${host}:${port}/inventarius_template`,
  );

  project.provide('pg', { host, port, adminUrl });
  return async () => {
    await container?.stop();
  };
}
