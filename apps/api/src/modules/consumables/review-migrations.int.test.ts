import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../../test/app.js';

/**
 * Migraciones de la revisión de F3.5 (0019 y siguientes). Cada una se vuelve a ejecutar sobre una base puesta en el estado
 * anterior, para comprobar qué hace con datos que ya existían (no solo con la base recién migrada).
 */
let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

const statementsOf = (file: string) =>
  readFileSync(new URL(`../../../drizzle/${file}`, import.meta.url), 'utf8').split(
    '--> statement-breakpoint',
  );

describe('migración 0019: consumables:reverse (P2)', () => {
  it('reparte los permisos sobre roles ya existentes sin quitar ni regalar anulaciones', async () => {
    const pool = env.db.migratorPool;
    // Estado de 0017: sin consumables:reverse y con consumables:adjust solo en el Administrador y en un rol propio.
    await pool.query(`DELETE FROM role_permissions WHERE permission = 'consumables:reverse'`);
    await pool.query(`DELETE FROM permissions WHERE key = 'consumables:reverse'`);
    await pool.query(
      `DELETE FROM role_permissions WHERE permission = 'consumables:adjust'
         AND role_id = (SELECT id FROM roles WHERE name = 'Operador')`,
    );
    await pool.query(
      `INSERT INTO roles (name, description) VALUES ('Con ajuste', 'x'), ('Sin ajuste', 'x')`,
    );
    await pool.query(
      `INSERT INTO role_permissions (role_id, permission)
         SELECT id, 'consumables:adjust' FROM roles WHERE name = 'Con ajuste'
         UNION ALL SELECT id, 'consumables:read' FROM roles WHERE name = 'Sin ajuste'`,
    );

    for (const sql of statementsOf('0019_consumables_reverse_permission.sql'))
      await pool.query(sql);

    const holders = async (permission: string) =>
      (
        await pool.query<{ name: string }>(
          `SELECT r.name FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
            WHERE rp.permission = $1 ORDER BY r.name`,
          [permission],
        )
      ).rows.map((r) => r.name);
    // Anula quien ya podía anular (tenía adjust): el Administrador y el rol propio; el Operador no.
    expect(await holders('consumables:reverse')).toEqual(['Administrador', 'Con ajuste']);
    // Ajusta quien ya ajustaba, más el Operador.
    expect(await holders('consumables:adjust')).toEqual([
      'Administrador',
      'Con ajuste',
      'Operador',
    ]);
  });
});
