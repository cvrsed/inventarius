import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../test/app.js';
import { FakeLnsAdapter, transient } from '../../test/fake-lns.js';
import {
  APP_KEY,
  devEui,
  JOIN_EUI,
  setupLorawan,
  type LorawanFixture,
} from '../../test/lorawan.js';
import { buildServices, type Services } from '../core/container.js';
import { PgBossQueue } from '../core/queue.js';
import { startLnsJobs } from './lns.js';

let env: TestEnv;
let fx: LorawanFixture;
let boss: PgBoss;
let api: Services;
const chirp = new FakeLnsAdapter('chirpstack');
const ttn = new FakeLnsAdapter('ttn');
const actor = { actorId: null, ip: null };

beforeAll(async () => {
  env = await createTestEnv(
    { LNS_MAX_ATTEMPTS: '3', LNS_RETRY_DELAY_SECONDS: '1' },
    { adapters: { chirpstack: chirp, ttn } },
  );
  fx = await setupLorawan(env, '10.53.0');
  // El esquema de la cola ya lo instaló el migrador (como en producción): la app solo opera.
  boss = new PgBoss({
    connectionString: env.db.appUrl,
    migrate: false,
    createSchema: false,
    supervise: false,
    schedule: false,
  });
  boss.on('error', () => undefined);
  await boss.start();
  api = buildServices({
    db: env.db.db,
    config: env.config,
    queue: new PgBossQueue(boss),
    adapters: { chirpstack: chirp, ttn },
  });
  // «Worker»: otra instancia de servicios que atiende las colas.
  await startLnsJobs(boss, env.services.registrations, { info: () => undefined });
});
afterAll(async () => {
  await boss.stop({ graceful: false });
  await env.close();
});

async function waitFor<T>(
  read: () => Promise<T>,
  done: (v: T) => boolean,
  ms = 20_000,
): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = await read();
    if (done(v) || Date.now() > until) return v;
    await new Promise((r) => setTimeout(r, 250));
  }
}

describe('cola real de pg-boss (RF-61, RF-63)', () => {
  it('la API encola y el worker registra y da de baja, con reintento tras un fallo transitorio', async () => {
    const profile = await env.services.lnsProfiles.create(actor, {
      kind: 'chirpstack',
      name: 'Cola real',
      description: null,
      active: true,
      endpoint: 'chirpstack.example.test:8080',
      tls: false,
      credential: 'clave-api-de-prueba-1234',
      target: {
        tenantId: '0190a1b2-0000-7000-8000-000000000001',
        applicationId: '0190a1b2-0000-7000-8000-000000000002',
      },
      deviceDefaults: { deviceProfileId: '0190a1b2-0000-7000-8000-000000000003' },
    });
    const a = await fx.newAsset({
      lorawan: { devEui: devEui(5000), joinEui: JOIN_EUI, appKey: APP_KEY },
    });
    chirp.registerOutcomes = [transient(), 'ok'];
    const first = await api.registrations.request(actor, a.id, profile.id);
    expect(first.status).toBe('registering');

    const status = () => api.registrations.find(env.db.db, a.id).then((r) => r?.status ?? 'none');
    expect(await waitFor(status, (s) => s === 'registered')).toBe('registered');
    expect(chirp.calls.filter((c) => c === 'register')).toHaveLength(2); // falló una vez y se reintentó
    expect(chirp.remote.get(devEui(5000))).toBe(a.id);

    await api.registrations.deregister(actor, a.id);
    expect(await waitFor(status, (s) => s === 'none')).toBe('none');
    expect(chirp.remote.has(devEui(5000))).toBe(false);
  });
});
