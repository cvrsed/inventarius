import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';

/** Misma imagen (por digest) que usa `compose.yml`. */
export const POSTGRES_IMAGE =
  'postgres:18@sha256:2ea8630df176ad090ec92136dee850397c5af8781e4bcf2e4162593691c61bbc';

export interface TestDatabase {
  container: StartedPostgreSqlContainer;
  /** URL del usuario migrador (DDL). */
  migratorUrl: string;
  /** URL del usuario de la app (solo DML). */
  appUrl: string;
  stop(): Promise<void>;
}

function urlFor(c: StartedPostgreSqlContainer, user: string, password: string): string {
  return `postgres://${user}:${password}@${c.getHost()}:${c.getPort()}/inventarius`;
}

/** Levanta un Postgres real con los mismos roles que producción (migrador y app). */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const admin = new Pool({ connectionString: container.getConnectionUri() });
  try {
    await admin.query("CREATE ROLE inventarius_migrator LOGIN PASSWORD 'test-migrator'");
    await admin.query("CREATE ROLE inventarius_app LOGIN PASSWORD 'test-app'");
    await admin.query('CREATE DATABASE inventarius OWNER inventarius_migrator');
  } finally {
    await admin.end();
  }
  return {
    container,
    migratorUrl: urlFor(container, 'inventarius_migrator', 'test-migrator'),
    appUrl: urlFor(container, 'inventarius_app', 'test-app'),
    stop: async () => {
      await container.stop();
    },
  };
}
