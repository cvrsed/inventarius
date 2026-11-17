import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDatabase, type TestDatabase } from '../../../test/postgres.js';
import { runMigrations } from './migrator.js';

/**
 * Definición de terminado: las migraciones nuevas se prueban sobre la versión anterior (con datos), no solo
 * desde cero. Se aplica el esquema de F1 (hasta `0004`), se cargan datos y luego se migra a la versión actual.
 */
const FULL = fileURLToPath(new URL('../../../drizzle', import.meta.url));
const F1_LAST_TAG = '0004_audit_actor_label';

let testDb: TestDatabase;
let pool: Pool;
let tmp: string;

beforeAll(async () => {
  testDb = await startTestDatabase();
  tmp = mkdtempSync(join(tmpdir(), 'inventarius-f1-'));
  cpSync(FULL, tmp, { recursive: true });
  const journalPath = join(tmp, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const keep = journal.entries.findIndex((e) => e.tag === F1_LAST_TAG) + 1;
  journal.entries = journal.entries.slice(0, keep);
  writeFileSync(journalPath, JSON.stringify(journal));

  pool = new Pool({ connectionString: testDb.migratorUrl, max: 2 });
  await migrate(drizzle(pool), { migrationsFolder: tmp });
}, 120_000);

afterAll(async () => {
  await pool.end();
  rmSync(tmp, { recursive: true, force: true });
  await testDb.stop();
});

describe('migración de F1 a F2 sobre una base con datos', () => {
  it('parte de un esquema sin tablas de inventario', async () => {
    const res = await pool.query("SELECT to_regclass('public.assets') AS t");
    expect(res.rows[0].t).toBeNull();
  });

  it('conserva usuarios y auditoría y agrega catálogo, estados semilla y el permiso nuevo', async () => {
    const user = await pool.query(
      "INSERT INTO users (email, name, password_hash) VALUES ('antes@ejemplo.cl', 'Antes', 'x') RETURNING id",
    );
    await pool.query("INSERT INTO audit_log (action, entity) VALUES ('user.create', 'user')");

    await runMigrations(testDb.migratorUrl);

    expect((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM audit_log')).rows[0].n).toBe(1);
    expect(user.rows[0].id).toBeTruthy();

    const statuses = await pool.query(
      'SELECT name, kind, system_key FROM status_labels ORDER BY name',
    );
    expect(statuses.rows.map((r) => r.name)).toEqual([
      'Asignado',
      'Dado de baja',
      'Dañado',
      'Disponible',
      'En reparación',
      'Pendiente de configuración',
    ]);
    expect(statuses.rows.find((r) => r.name === 'Asignado').system_key).toBe('assigned');

    const restore = await pool.query(
      `SELECT r.name FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE rp.permission = 'asset:restore'`,
    );
    expect(restore.rows.map((r) => r.name)).toEqual(['Administrador']);
  });

  it('el usuario de la app puede operar el inventario pero la secuencia de etiquetas funciona', async () => {
    const app = new Pool({ connectionString: testDb.appUrl, max: 1 });
    try {
      const next = await app.query("SELECT nextval('asset_tag_seq') AS n");
      expect(Number(next.rows[0].n)).toBe(1);
      await expect(app.query('SELECT count(*) FROM assets')).resolves.toBeDefined();
    } finally {
      await app.end();
    }
  });

  it('volver a migrar es idempotente', async () => {
    await expect(runMigrations(testDb.migratorUrl)).resolves.toBeUndefined();
    expect((await pool.query('SELECT count(*)::int AS n FROM status_labels')).rows[0].n).toBe(6);
  });
});
