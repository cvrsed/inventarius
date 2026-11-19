import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../../test/app.js';
import {
  DEFAULT_DEVICE_PROFILE,
  FakeLnsAdapter,
  partial,
  permanent,
  transient,
} from '../../../test/fake-lns.js';
import {
  APP_KEY,
  devEui,
  JOIN_EUI,
  setupLorawan,
  type LorawanFixture,
} from '../../../test/lorawan.js';
import { LNS_DEREGISTER_QUEUE, LNS_REGISTER_QUEUE } from '../../core/queues.js';

let env: TestEnv;
let fx: LorawanFixture;
const chirp = new FakeLnsAdapter('chirpstack');
const ttn = new FakeLnsAdapter('ttn');
const base = '/api/v1';
let seq = 100;
const CS = {
  tenantId: '0190a1b2-0000-7000-8000-000000000001',
  applicationId: '0190a1b2-0000-7000-8000-000000000002',
};
const DP = '0190a1b2-0000-7000-8000-000000000003';
const API_KEY = 'clave-api-de-prueba-9f3a';

beforeAll(async () => {
  env = await createTestEnv({ LNS_MAX_ATTEMPTS: '3' }, { adapters: { chirpstack: chirp, ttn } });
  fx = await setupLorawan(env, '10.51.0');
});
afterAll(async () => env.close());

let profileSeq = 0;
async function newProfile(extra: Record<string, unknown> = {}) {
  profileSeq += 1;
  const res = await fx.admin.post(`${base}/lns-profiles`, {
    kind: 'chirpstack',
    name: `ChirpStack ${profileSeq}`,
    endpoint: 'chirpstack.example.test:8080',
    credential: API_KEY,
    target: CS,
    deviceDefaults: { deviceProfileId: DP },
    ...extra,
  });
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as { id: string; updatedAt: string; name: string };
}

/** Activo LoRaWAN con todos los datos listos para registrar. */
async function readyAsset() {
  seq += 1;
  const a = await fx.newAsset({
    lorawan: { devEui: devEui(seq), joinEui: JOIN_EUI, appKey: APP_KEY },
  });
  return { ...a, devEui: devEui(seq) };
}

/** Ejecuta en orden los jobs que la API dejó en la cola (lo que hace el worker). */
async function drain() {
  for (let i = 0; i < 5; i += 1) {
    const reg = env.queue.take(LNS_REGISTER_QUEUE);
    const dereg = env.queue.take(LNS_DEREGISTER_QUEUE);
    if (!reg.length && !dereg.length) return;
    for (const id of reg) await env.services.registrations.runRegister(id).catch(() => undefined);
    for (const id of dereg)
      await env.services.registrations.runDeregister(id).catch(() => undefined);
  }
}

async function register(assetId: string, profileId: string, client = fx.tech) {
  return client.post(`${base}/assets/${assetId}/lns-registration`, { profileId });
}
const lorawan = async (assetId: string) =>
  (await fx.reader.get(`${base}/assets/${assetId}/lorawan`)).json();
const reset = () => {
  for (const f of [chirp, ttn]) {
    f.remote.clear();
    f.calls = [];
    f.registerOutcomes = [];
    f.deregisterOutcomes = [];
    f.deviceProfile = { ...DEFAULT_DEVICE_PROFILE };
    f.describeOutcome = null;
  }
};

describe('perfiles LNS (RF-50 a RF-52)', () => {
  it('se crea sin devolver la credencial, que queda cifrada y solo se ve «•••• últimos 4»', async () => {
    const res = await fx.admin.post(`${base}/lns-profiles`, {
      kind: 'chirpstack',
      name: 'Principal',
      endpoint: 'chirpstack.example.test:8080',
      credential: API_KEY,
      target: CS,
      deviceDefaults: { deviceProfileId: DP },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().credentialHint).toBe('•••• 9f3a');
    expect(res.body).not.toContain(API_KEY);
    expect(res.json()).not.toHaveProperty('credential');
    const { rows } = await env.db.migratorPool.query(
      "SELECT encode(credential_enc, 'escape') AS raw, key_id FROM lns_profiles WHERE name = 'Principal'",
    );
    expect(rows[0].raw).not.toContain(API_KEY);
    expect(rows[0].key_id).toBe('k1');
    const audit = await env.db.migratorPool.query(
      "SELECT diff::text AS d FROM audit_log WHERE entity = 'lns_profile'",
    );
    expect(audit.rows.map((r) => r.d).join()).not.toContain(API_KEY);
  });

  it('valida el proveedor, el nombre único y los permisos', async () => {
    const body = {
      kind: 'chirpstack',
      name: 'Otro',
      endpoint: 'sin-puerto',
      credential: API_KEY,
      target: CS,
      deviceDefaults: { deviceProfileId: DP },
    };
    expect((await fx.admin.post(`${base}/lns-profiles`, body)).statusCode).toBe(400);
    await newProfile({ name: 'Repetido' });
    const dup = await fx.admin.post(`${base}/lns-profiles`, {
      ...body,
      endpoint: 'a.example.test:8080',
      name: 'repetido',
    });
    expect(dup.statusCode).toBe(409);
    for (const c of [fx.operator, fx.tech, fx.reader]) {
      expect((await c.get(`${base}/lns-profiles`)).statusCode).toBe(403);
    }
  });

  it('quien registra ve solo los perfiles activos (opciones) sin administrarlos', async () => {
    const p = await newProfile({ name: 'Inactivo', active: false });
    const res = await fx.tech.get(`${base}/lns-profiles/options`);
    expect(res.statusCode).toBe(200);
    const names = (res.json() as { name: string }[]).map((x) => x.name);
    expect(names).not.toContain('Inactivo');
    expect(names.length).toBeGreaterThan(0);
    expect(p.id).toBeTruthy();
    expect(JSON.stringify(res.json())).not.toContain('credential');
  });

  it('PATCH exige If-Match, reemplaza la credencial y la audita sin guardarla', async () => {
    const p = await newProfile();
    expect((await fx.admin.patch(`${base}/lns-profiles/${p.id}`, { name: 'x' })).statusCode).toBe(
      428,
    );
    const stale = await fx.admin.patch(
      `${base}/lns-profiles/${p.id}`,
      { name: 'x' },
      { 'if-match': '"viejo"' },
    );
    expect(stale.statusCode).toBe(412);
    const res = await fx.admin.patch(
      `${base}/lns-profiles/${p.id}`,
      { credential: 'otra-clave-de-prueba-77aa', description: 'Principal' },
      { 'if-match': `"${p.updatedAt}"` },
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ credentialHint: '•••• 77aa', description: 'Principal' });
    const audit = await env.db.migratorPool.query(
      "SELECT diff FROM audit_log WHERE action = 'lns_profile.update' AND entity_id = $1",
      [p.id],
    );
    expect(audit.rows[0].diff.after).toMatchObject({ credentialChanged: true });
    expect(JSON.stringify(audit.rows)).not.toContain('otra-clave');
    // Un cambio parcial de target se valida contra el proveedor.
    const bad = await fx.admin.patch(
      `${base}/lns-profiles/${p.id}`,
      { target: { tenantId: 'no-es-uuid' } },
      { 'if-match': `"${res.json().updatedAt}"` },
    );
    expect(bad.statusCode).toBe(422);
  });

  it('Probar conexión devuelve resultado y latencia, sin la credencial', async () => {
    const p = await newProfile();
    const res = await fx.admin.post(`${base}/lns-profiles/${p.id}/test`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, latencyMs: 12 });
    expect(res.body).not.toContain(API_KEY);
    chirp.connection = {
      ok: false,
      latencyMs: 3,
      checks: [{ name: 'tenant', ok: false, detail: 'ChirpStack rechazó la credencial' }],
    };
    expect((await fx.admin.post(`${base}/lns-profiles/${p.id}/test`)).json().ok).toBe(false);
    chirp.connection = {
      ok: true,
      latencyMs: 12,
      checks: [{ name: 'application', ok: true, detail: null }],
    };
  });

  it('un perfil con dispositivos registrados no se borra ni cambia de destino, solo se desactiva (RF-52)', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    await register(a.id, p.id);
    await drain();
    const list = (await fx.admin.get(`${base}/lns-profiles?pageSize=100`)).json().data as {
      id: string;
      registeredDevices: number;
    }[];
    expect(list.find((x) => x.id === p.id)!.registeredDevices).toBe(1);
    expect((await fx.admin.delete(`${base}/lns-profiles/${p.id}`)).statusCode).toBe(409);
    const cur = (await fx.admin.get(`${base}/lns-profiles/${p.id}`)).json();
    const move = await fx.admin.patch(
      `${base}/lns-profiles/${p.id}`,
      { endpoint: 'otro.example.test:8080' },
      { 'if-match': `"${cur.updatedAt}"` },
    );
    expect(move.statusCode).toBe(409);
    const off = await fx.admin.patch(
      `${base}/lns-profiles/${p.id}`,
      { active: false },
      { 'if-match': `"${cur.updatedAt}"` },
    );
    expect(off.json().active).toBe(false);
    // Uno sin uso sí se borra.
    const free = await newProfile();
    expect((await fx.admin.delete(`${base}/lns-profiles/${free.id}`)).statusCode).toBe(204);
  });
});

describe('registro en el LNS (RF-60 a RF-65)', () => {
  it('flujo completo: vista previa sin claves, 202, job, registrado con id externo y auditoría', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    const preview = await fx.tech.post(`${base}/assets/${a.id}/lns-registration/preview`, {
      profileId: p.id,
    });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json().externalId).toBe(a.devEui.toLowerCase());
    expect(preview.body).not.toContain(APP_KEY);

    const res = await register(a.id, p.id);
    expect(res.statusCode).toBe(202);
    expect(res.json()).toMatchObject({ status: 'registering', profile: { id: p.id } });
    expect(env.queue.jobs).toHaveLength(1);
    expect(env.queue.jobs[0]!.options).toMatchObject({ retryLimit: 3, retryBackoff: true });
    expect((await lorawan(a.id)).registration.status).toBe('registering');

    await drain();
    const done = (await lorawan(a.id)).registration;
    expect(done).toMatchObject({
      status: 'registered',
      externalId: a.devEui.toLowerCase(),
      origin: 'created',
      lastError: null,
    });
    expect(done.registeredAt).not.toBeNull();
    // Las claves llegaron descifradas al adaptador, y solo allí.
    expect(chirp.lastDevice).toMatchObject({ appKey: APP_KEY, assetId: a.id, devEui: a.devEui });
    const history = (await fx.reader.get(`${base}/assets/${a.id}/history`)).json().data as {
      action: string;
    }[];
    expect(history.map((h) => h.action)).toEqual(
      expect.arrayContaining(['lns.register', 'lns.registered']),
    );
    const audit = await env.db.migratorPool.query('SELECT diff::text AS d FROM audit_log');
    expect(audit.rows.map((r) => r.d).join()).not.toContain(APP_KEY);
  });

  it('exige datos completos (422), perfil activo, permiso y no admite un segundo registro (RF-65)', async () => {
    reset();
    const p = await newProfile();
    const empty = await fx.newAsset();
    const incomplete = await register(empty.id, p.id);
    expect(incomplete.statusCode).toBe(422);
    expect(JSON.stringify(incomplete.json().errors)).toContain('devEui');
    expect(env.queue.jobs).toHaveLength(0);

    const a = await readyAsset();
    const off = await newProfile({ active: false });
    expect((await register(a.id, off.id)).statusCode).toBe(422);
    expect((await register(a.id, p.id, fx.reader)).statusCode).toBe(403);
    expect((await register(a.id, p.id)).statusCode).toBe(202);
    const again = await register(a.id, (await newProfile()).id);
    expect(again.statusCode).toBe(409);
    await drain();
    expect((await register(a.id, p.id)).statusCode).toBe(409); // ya registrado
  });

  describe('versión, clase y región contra el device profile del LNS (RF-60)', () => {
    it('si no calzan, no registra, no encola y explica qué difiere', async () => {
      reset();
      const p = await newProfile();
      const a = await readyAsset();
      chirp.deviceProfile = {
        ...DEFAULT_DEVICE_PROFILE,
        name: 'Perfil EU868',
        version: '1.1',
        region: 'EU868',
        classes: ['A', 'B'],
        regionLabel: 'EU868',
      };
      // El activo es AU915, 1.0.3 y clase A (los del modelo): región y versión difieren; la clase A siempre calza.
      const res = await register(a.id, p.id);
      expect(res.statusCode, res.body).toBe(422);
      const errors = res.json().errors as Record<string, string[]>;
      expect(Object.keys(errors).sort()).toEqual(['lorawanVersion', 'region']);
      expect(errors['region']![0]).toContain('AU915');
      expect(errors['region']![0]).toContain('EU868');
      expect(errors['region']![0]).toContain('Perfil EU868');
      expect(errors['lorawanVersion']![0]).toContain('1.0.3');
      expect(errors['lorawanVersion']![0]).toContain('1.1');
      expect(env.queue.jobs).toHaveLength(0);
      expect((await lorawan(a.id)).registration).toBeNull();
      // La vista previa lo muestra en vez de fallar, para que la pantalla lo explique.
      const preview = await fx.tech.post(`${base}/assets/${a.id}/lns-registration/preview`, {
        profileId: p.id,
      });
      expect(preview.statusCode, preview.body).toBe(200);
      expect(preview.json().mismatches.map((m: { field: string }) => m.field)).toEqual([
        'lorawanVersion',
        'region',
      ]);
    });

    it('una clase que el device profile no admite también se rechaza', async () => {
      reset();
      const p = await newProfile();
      const a = await readyAsset();
      await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, { deviceClass: 'C' });
      const res = await register(a.id, p.id);
      expect(res.statusCode, res.body).toBe(422);
      expect(res.json().errors.deviceClass[0]).toContain('C');
      chirp.deviceProfile = { ...DEFAULT_DEVICE_PROFILE, classes: ['A', 'C'] };
      expect((await register(a.id, p.id)).statusCode).toBe(202);
      await drain();
    });

    it('si el LNS no responde no se puede validar: no registra y lo dice', async () => {
      reset();
      const p = await newProfile();
      const a = await readyAsset();
      chirp.describeOutcome = transient('No se pudo conectar con ChirpStack');
      const res = await register(a.id, p.id);
      expect(res.statusCode, res.body).toBe(409);
      expect(res.json().detail).toContain('No se pudo conectar con ChirpStack');
      expect(env.queue.jobs).toHaveLength(0);
    });
  });

  it('un job repetido no registra dos veces (idempotencia)', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    await register(a.id, p.id);
    const [id] = env.queue.take(LNS_REGISTER_QUEUE);
    await env.services.registrations.runRegister(id!);
    await env.services.registrations.runRegister(id!);
    expect(chirp.calls.filter((c) => c === 'register')).toHaveLength(1);
  });

  it('si el dispositivo ya existe y no es nuestro: conflicto; vincular lo toma sin tocarlo (RF-64)', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    chirp.remote.set(a.devEui, null);
    await register(a.id, p.id);
    await drain();
    expect(chirp.calls).not.toContain('register');
    const conflict = (await lorawan(a.id)).registration;
    expect(conflict).toMatchObject({ status: 'conflict', externalId: a.devEui.toLowerCase() });
    expect(conflict.lastError).toMatch(/ya existe/);

    const link = await fx.tech.post(`${base}/assets/${a.id}/lns-registration/resolve`, {
      action: 'link',
    });
    expect(link.json()).toMatchObject({ status: 'registered', origin: 'linked' });
    expect(chirp.calls).not.toContain('register');
    // Dar de baja un vinculado solo lo desvincula: el dispositivo ajeno sigue en el LNS.
    const baja = await fx.tech.delete(`${base}/assets/${a.id}/lns-registration`);
    expect(baja.statusCode).toBe(202);
    expect(chirp.calls).not.toContain('deregister');
    expect(chirp.remote.has(a.devEui)).toBe(true);
    expect((await lorawan(a.id)).registration).toBeNull();
  });

  it('cancelar un conflicto deja el activo sin registro', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    chirp.remote.set(a.devEui, null);
    await register(a.id, p.id);
    await drain();
    expect(
      (await fx.tech.post(`${base}/assets/${a.id}/lns-registration/resolve`, { action: 'cancel' }))
        .statusCode,
    ).toBe(200);
    expect((await lorawan(a.id)).registration).toBeNull();
    expect(
      (await fx.tech.post(`${base}/assets/${a.id}/lns-registration/resolve`, { action: 'link' }))
        .statusCode,
    ).toBe(409);
  });

  it('error permanente: queda en error con mensaje legible y sin reintentos automáticos; reintentar funciona (RF-63)', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    chirp.registerOutcomes = [permanent('ChirpStack rechazó los datos: dev_eui inválido')];
    await register(a.id, p.id);
    await drain();
    expect((await lorawan(a.id)).registration).toMatchObject({
      status: 'error',
      lastError: 'ChirpStack rechazó los datos: dev_eui inválido',
      attempts: 1,
    });
    const retry = await fx.tech.post(`${base}/assets/${a.id}/lns-registration/retry`);
    expect(retry.statusCode).toBe(202);
    await drain();
    expect((await lorawan(a.id)).registration).toMatchObject({
      status: 'registered',
      lastError: null,
    });
    expect((await fx.tech.post(`${base}/assets/${a.id}/lns-registration/retry`)).statusCode).toBe(
      409,
    );
  });

  it('error transitorio: el job se reintenta (lanza) hasta el máximo y luego queda en error', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    chirp.registerOutcomes = [transient(), transient(), transient()];
    await register(a.id, p.id);
    const [id] = env.queue.take(LNS_REGISTER_QUEUE);
    const svc = env.services.registrations;
    await expect(svc.runRegister(id!)).rejects.toThrow(); // intento 1: pg-boss reintenta
    expect((await lorawan(a.id)).registration).toMatchObject({
      status: 'registering',
      attempts: 1,
    });
    expect((await lorawan(a.id)).registration.lastError).toMatch(/Reintentando \(1\/3\)/);
    await expect(svc.runRegister(id!)).rejects.toThrow();
    await svc.runRegister(id!); // intento 3: se rinde
    expect((await lorawan(a.id)).registration).toMatchObject({ status: 'error', attempts: 3 });
  });

  it('un error transitorio que se recupera termina registrado', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    chirp.registerOutcomes = [transient(), 'ok'];
    await register(a.id, p.id);
    const [id] = env.queue.take(LNS_REGISTER_QUEUE);
    await expect(env.services.registrations.runRegister(id!)).rejects.toThrow();
    await env.services.registrations.runRegister(id!);
    expect((await lorawan(a.id)).registration.status).toBe('registered');
  });

  it('si la compensación falla queda «parcial» con los huérfanos; reintentar limpia lo propio y registra', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    chirp.registerOutcomes = [partial(['device'])];
    await register(a.id, p.id);
    await drain();
    expect((await lorawan(a.id)).registration).toMatchObject({
      status: 'partial',
      orphans: ['device'],
    });
    chirp.remote.set(a.devEui, a.id); // lo que quedó en el LNS
    await fx.tech.post(`${base}/assets/${a.id}/lns-registration/retry`);
    await drain();
    expect(chirp.calls.slice(-3)).toEqual(['find', 'deregister', 'register']);
    expect((await lorawan(a.id)).registration).toMatchObject({ status: 'registered', orphans: [] });
  });

  it('si el worker cayó tras crear en el LNS y antes de guardar, el reintento no duplica ni choca', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    await register(a.id, p.id);
    chirp.remote.set(a.devEui, a.id); // el LNS ya lo tiene, marcado como nuestro
    await drain();
    expect((await lorawan(a.id)).registration.status).toBe('registered');
    expect(chirp.remote.get(a.devEui)).toBe(a.id);
  });

  it('un fallo interno (p. ej. no se pueden leer los datos) da un mensaje genérico sin detalles', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    await register(a.id, p.id);
    await env.db.migratorPool.query('UPDATE asset_lorawan SET key_id = $2 WHERE asset_id = $1', [
      a.id,
      'desconocida',
    ]);
    await drain();
    const reg = (await lorawan(a.id)).registration;
    expect(reg.status).toBe('error');
    expect(reg.lastError).toBe('No se pudieron leer los datos del dispositivo o el perfil');
    expect(reg.lastError).not.toContain('desconocida');
  });

  it('si no se puede encolar, el registro queda en error y la API responde 409', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    env.queue.failNext = new Error('cola caída');
    const res = await register(a.id, p.id);
    expect(res.statusCode).toBe(409);
    expect((await lorawan(a.id)).registration).toMatchObject({ status: 'error' });
    expect((await fx.tech.post(`${base}/assets/${a.id}/lns-registration/retry`)).statusCode).toBe(
      202,
    );
    await drain();
    expect((await lorawan(a.id)).registration.status).toBe('registered');
  });

  it('mientras está registrado no se cambian DevEUI ni claves, ni se da de baja el activo', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    await register(a.id, p.id);
    await drain();
    expect(
      (await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, { devEui: devEui(900) }))
        .statusCode,
    ).toBe(409);
    expect(
      (await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, { appKey: APP_KEY })).statusCode,
    ).toBe(409);
    expect(
      (await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, { deviceClass: 'C' })).statusCode,
    ).toBe(200);
    const del = await fx.operator.request({
      method: 'DELETE',
      url: `${base}/assets/${a.id}`,
      payload: { reason: 'prueba' },
    });
    expect(del.statusCode).toBe(409);
    await fx.tech.delete(`${base}/assets/${a.id}/lns-registration`);
    await drain();
    expect(
      (await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, { devEui: devEui(901) }))
        .statusCode,
    ).toBe(200);
  });
});

describe('baja en el LNS (RF-62)', () => {
  it('borra en el LNS, deja el activo «no registrado» y queda en el historial', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    await register(a.id, p.id);
    await drain();
    const res = await fx.tech.delete(`${base}/assets/${a.id}/lns-registration`);
    expect(res.statusCode).toBe(202);
    expect(res.json().status).toBe('deregistering');
    await drain();
    expect(chirp.remote.has(a.devEui)).toBe(false);
    expect((await lorawan(a.id)).registration).toBeNull();
    const history = (await fx.reader.get(`${base}/assets/${a.id}/history`)).json().data as {
      action: string;
    }[];
    expect(history.map((h) => h.action)).toEqual(
      expect.arrayContaining(['lns.deregister', 'lns.deregistered']),
    );
    // Se puede volver a registrar, incluso en otro perfil.
    expect((await register(a.id, (await newProfile()).id)).statusCode).toBe(202);
  });

  it('si falla queda «parcial»; reintentar retoma la baja', async () => {
    reset();
    const p = await newProfile();
    const a = await readyAsset();
    await register(a.id, p.id);
    await drain();
    chirp.deregisterOutcomes = [permanent('ChirpStack respondió con un error')];
    await fx.tech.delete(`${base}/assets/${a.id}/lns-registration`);
    await drain();
    expect((await lorawan(a.id)).registration).toMatchObject({
      status: 'partial',
      orphans: ['device'],
    });
    await fx.tech.post(`${base}/assets/${a.id}/lns-registration/retry`);
    await drain();
    expect((await lorawan(a.id)).registration).toBeNull();
    expect(chirp.remote.has(a.devEui)).toBe(false);
  });

  it('sin registro no hay nada que dar de baja (404)', async () => {
    const a = await readyAsset();
    expect((await fx.tech.delete(`${base}/assets/${a.id}/lns-registration`)).statusCode).toBe(404);
  });
});

describe('listado (RF-22)', () => {
  it('filtra por estado LNS y busca por DevEUI', async () => {
    reset();
    const p = await newProfile();
    const registered = await readyAsset();
    const idle = await readyAsset();
    await register(registered.id, p.id);
    await drain();
    const ids = async (qs: string) =>
      (
        (await fx.reader.get(`${base}/assets?${qs}&pageSize=100`)).json().data as { id: string }[]
      ).map((x) => x.id);
    expect(await ids('lnsStatus=registered')).toContain(registered.id);
    expect(await ids('lnsStatus=registered')).not.toContain(idle.id);
    expect(await ids('lnsStatus=none')).toContain(idle.id);
    expect(await ids('lnsStatus=none')).not.toContain(registered.id);
    expect(await ids(`q=${idle.devEui.toLowerCase()}`)).toEqual([idle.id]);
    const row = (await fx.reader.get(`${base}/assets?q=${registered.devEui}`)).json().data[0];
    expect(row).toMatchObject({ devEui: registered.devEui, lnsStatus: 'registered' });
  });
});
