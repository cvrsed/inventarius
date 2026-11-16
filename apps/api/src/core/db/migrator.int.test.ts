import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { buildApp } from '../../app.js';
import { loadConfig } from '../config.js';
import { startTestDatabase, type TestDatabase } from '../../../test/postgres.js';
import { createDb, pingDatabase, pingQueue, type DbHandle } from './client.js';
import { runMigrations } from './migrator.js';
import { appMeta } from './schema.js';

let testDb: TestDatabase;
let app: DbHandle;

beforeAll(async () => {
  testDb = await startTestDatabase();
  app = createDb(testDb.appUrl);
});

afterAll(async () => {
  await app.close();
  await testDb.stop();
});

describe('readiness antes de migrar', () => {
  it('la BD responde pero la cola aún no existe', async () => {
    expect(await pingDatabase(app.pool)).toBe(true);
    expect(await pingQueue(app.pool)).toBe(false);
  });
});

describe('migraciones desde cero', () => {
  beforeAll(async () => {
    await runMigrations(testDb.migratorUrl);
  });

  it('crea app_meta y habilita citext', async () => {
    const ext = await app.pool.query("SELECT 1 FROM pg_extension WHERE extname = 'citext'");
    expect(ext.rowCount).toBe(1);
    await app.db.insert(appMeta).values({ key: 'schema', value: 'f0' });
    const rows = await app.db.select().from(appMeta);
    expect(rows).toHaveLength(1);
  });

  it('es idempotente: volver a migrar no falla', async () => {
    await expect(runMigrations(testDb.migratorUrl)).resolves.toBeUndefined();
  });

  it('el usuario de la app no puede hacer DDL', async () => {
    await expect(app.pool.query('CREATE TABLE intruso (id int)')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('PostgreSQL 18 trae uuidv7() nativo', async () => {
    const res = await app.pool.query<{ v: number }>('SELECT uuid_extract_version(uuidv7()) AS v');
    expect(res.rows[0]?.v).toBe(7);
  });

  it('la cola queda instalada y accesible para el usuario de la app', async () => {
    expect(await pingQueue(app.pool)).toBe(true);
    await expect(app.pool.query('SELECT count(*) FROM pgboss.job')).resolves.toBeDefined();
  });

  it('/api/health/ready responde 200 con BD real', async () => {
    const config = loadConfig({
      DATABASE_URL: testDb.appUrl,
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
    });
    const server = await buildApp({
      config,
      health: { database: () => pingDatabase(app.pool), queue: () => pingQueue(app.pool) },
    });
    const res = await server.inject({ url: '/api/health/ready' });
    await server.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', checks: { database: 'up', queue: 'up' } });
  });

  it('migrar sobre una BD con datos conserva las filas', async () => {
    const check = new Pool({ connectionString: testDb.migratorUrl });
    const before = await check.query('SELECT count(*)::int AS n FROM app_meta');
    await runMigrations(testDb.migratorUrl);
    const after = await check.query('SELECT count(*)::int AS n FROM app_meta');
    await check.end();
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
