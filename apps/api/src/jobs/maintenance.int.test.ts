import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../test/app.js';
import { PURGE_SESSIONS_QUEUE } from '../core/queues.js';
import { PURGE_SESSIONS_CRON, startMaintenanceJobs } from './maintenance.js';

let env: TestEnv;
let userId: string;
beforeAll(async () => {
  env = await createTestEnv();
  userId = await env.createUser({ email: 'job@ejemplo.cl', role: 'Lector' });
});
afterAll(async () => env.close());

const insertSession = (id: string, expiresAt: string, lastSeenAt: string) =>
  env.db.migratorPool.query(
    'INSERT INTO sessions (id, user_id, last_seen_at, expires_at) VALUES ($1, $2, $3, $4)',
    [id, userId, lastSeenAt, expiresAt],
  );
const sessionIds = async () =>
  (await env.db.migratorPool.query('SELECT id FROM sessions ORDER BY id')).rows.map(
    (r: { id: string }) => r.id,
  );

describe('purga de sesiones vencidas (RF-03)', () => {
  it('borra las vencidas por tiempo absoluto o por inactividad y conserva las vigentes', async () => {
    const now = env.clock.now().getTime();
    const iso = (offsetSeconds: number) => new Date(now + offsetSeconds * 1000).toISOString();
    await insertSession('viva', iso(3600), iso(-60));
    await insertSession('absoluta-vencida', iso(-1), iso(-60));
    await insertSession('inactiva-vencida', iso(3600), iso(-(8 * 3600 + 1)));

    const deleted = await env.services.auth.purgeExpired();

    expect(deleted).toBe(2);
    expect(await sessionIds()).toEqual(['viva']);
  });
});

describe('job periódico de mantenimiento (pg-boss)', () => {
  it('programa la purga cada hora y la ejecuta con el usuario de BD de la aplicación', async () => {
    await env.db.migratorPool.query('DELETE FROM sessions');
    const now = env.clock.now().getTime();
    await insertSession('vencida', new Date(now - 1000).toISOString(), new Date(now).toISOString());
    await insertSession(
      'vigente',
      new Date(now + 3_600_000).toISOString(),
      new Date(now).toISOString(),
    );

    const boss = new PgBoss({
      connectionString: env.db.appUrl,
      migrate: false,
      createSchema: false,
    });
    boss.on('error', () => undefined);
    await boss.start();
    try {
      let purged = -1;
      await startMaintenanceJobs(boss, {
        purgeSessions: async () => (purged = await env.services.auth.purgeExpired()),
        log: { info: () => undefined },
      });

      const schedules = await boss.getSchedules(PURGE_SESSIONS_QUEUE);
      expect(schedules).toHaveLength(1);
      expect(schedules[0]!.cron).toBe('0 * * * *');
      expect(PURGE_SESSIONS_CRON).toBe('0 * * * *');

      await boss.send(PURGE_SESSIONS_QUEUE);
      await expect.poll(() => purged, { timeout: 15_000, interval: 200 }).toBe(1);
      expect(await sessionIds()).toEqual(['vigente']);
    } finally {
      await boss.stop({ graceful: false });
    }
  });

  it('programar dos veces no duplica el horario', async () => {
    const boss = new PgBoss({
      connectionString: env.db.appUrl,
      migrate: false,
      createSchema: false,
    });
    boss.on('error', () => undefined);
    await boss.start();
    try {
      const deps = { purgeSessions: async () => 0, log: { info: () => undefined } };
      await startMaintenanceJobs(boss, deps);
      await startMaintenanceJobs(boss, deps);
      expect(await boss.getSchedules(PURGE_SESSIONS_QUEUE)).toHaveLength(1);
    } finally {
      await boss.stop({ graceful: false });
    }
  });
});
