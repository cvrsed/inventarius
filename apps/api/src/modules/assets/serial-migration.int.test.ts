import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../../test/app.js';

/**
 * Migración 0014: el índice único sobre `lower(serial)`. Se repite su SQL sobre una base con series repetidas para
 * comprobar que se detiene nombrándolas (no borra ni corrige nada) y que, corregidas, crea el índice.
 */
let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

const migration = readFileSync(
  new URL('../../../drizzle/0014_asset_serial_unique.sql', import.meta.url),
  'utf8',
);
const statements = migration.split('--> statement-breakpoint');

describe('migración 0014: serie única sin distinguir mayúsculas', () => {
  it('con series repetidas se detiene y las lista; corregidas, crea el índice', async () => {
    const pool = env.db.migratorPool;
    await pool.query('DROP INDEX assets_serial_lower_uq');
    // Prepara datos mínimos con las FKs reales.
    await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fab')`);
    await pool.query(`INSERT INTO categories (name) VALUES ('Cat')`);
    await pool.query(
      `INSERT INTO models (name, manufacturer_id, category_id)
         SELECT 'Mod', (SELECT id FROM manufacturers LIMIT 1), (SELECT id FROM categories LIMIT 1)`,
    );
    await pool.query(`INSERT INTO locations (name, type) VALUES ('Bodega', 'warehouse')`);
    const insert = (tag: string, serial: string | null) =>
      pool.query(
        `INSERT INTO assets (asset_tag, name, serial, model_id, status_id, base_location_id, location_id)
           VALUES ($1, 'A', $2, (SELECT id FROM models LIMIT 1),
                   (SELECT id FROM status_labels LIMIT 1), (SELECT id FROM locations LIMIT 1),
                   (SELECT id FROM locations LIMIT 1))`,
        [tag, serial],
      );
    await insert('MIG-1', 'Abc-1');
    await insert('MIG-2', 'ABC-1');
    await insert('MIG-3', null);
    await insert('MIG-4', null);

    await expect(pool.query(statements[0]!)).rejects.toThrow(/abc-1 \(2 activos\)/);
    // No tocó los datos.
    expect((await pool.query('SELECT 1 FROM assets WHERE serial IS NOT NULL')).rowCount).toBe(2);

    await pool.query(`UPDATE assets SET serial = 'ABC-2' WHERE asset_tag = 'MIG-2'`);
    for (const sql of statements) await pool.query(sql);
    await expect(insert('MIG-5', 'abc-2')).rejects.toThrow(/assets_serial_lower_uq/);
    await insert('MIG-6', null);
  });
});
