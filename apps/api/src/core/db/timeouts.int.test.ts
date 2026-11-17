import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedDb, type IsolatedDb } from '../../../test/db.js';
import { createDb } from './client.js';

let db: IsolatedDb;
beforeAll(async () => {
  db = await createIsolatedDb();
});
afterAll(async () => db.drop());

describe('topes de la conexión a la BD [P33]', () => {
  it('una consulta más lenta que statement_timeout se corta', async () => {
    const h = createDb(db.appUrl, {
      connectionTimeoutMs: 2_000,
      statementTimeoutMs: 300,
      idleInTransactionTimeoutMs: 0,
    });
    try {
      const started = Date.now();
      await expect(h.pool.query('SELECT pg_sleep(5)')).rejects.toThrow(/statement timeout/);
      expect(Date.now() - started).toBeLessThan(3_000);
      // El pool sigue sirviendo después del corte.
      expect((await h.pool.query('SELECT 1 AS ok')).rows[0].ok).toBe(1);
    } finally {
      await h.close();
    }
  });

  it('una transacción abierta e inactiva se termina (idle_in_transaction_session_timeout)', async () => {
    const h = createDb(db.appUrl, {
      connectionTimeoutMs: 2_000,
      statementTimeoutMs: 0,
      idleInTransactionTimeoutMs: 300,
    });
    try {
      const client = await h.pool.connect();
      // El servidor termina la conexión y el cliente lo informa con un evento `error`.
      const terminated = new Promise<Error>((resolve) => client.once('error', resolve));
      await client.query('BEGIN');
      const error = await Promise.race([
        terminated,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('la transacción inactiva no se terminó')), 5_000),
        ),
      ]);
      expect(error.message).toMatch(/idle-in-transaction/i);
      client.release(true);
    } finally {
      await h.close();
    }
  });

  it('sin conexión libre, esperar más que connectionTimeout falla en lugar de colgarse', async () => {
    const h = createDb(db.appUrl, {
      connectionTimeoutMs: 300,
      statementTimeoutMs: 0,
      idleInTransactionTimeoutMs: 0,
    });
    const held = await Promise.all(Array.from({ length: 10 }, () => h.pool.connect()));
    try {
      await expect(h.pool.query('SELECT 1')).rejects.toThrow(/timeout/i);
    } finally {
      held.forEach((c) => c.release());
      await h.close();
    }
  });

  it('con 0 los topes se desactivan', async () => {
    const h = createDb(db.appUrl, {
      connectionTimeoutMs: 0,
      statementTimeoutMs: 0,
      idleInTransactionTimeoutMs: 0,
    });
    try {
      const r = await h.pool.query("SELECT current_setting('statement_timeout') AS t");
      expect(r.rows[0].t).toBe('0');
    } finally {
      await h.close();
    }
  });
});
