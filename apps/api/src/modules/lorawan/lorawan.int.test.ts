import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../../test/app.js';
import {
  APP_KEY,
  devEui,
  JOIN_EUI,
  NWK_KEY,
  setupLorawan,
  type LorawanFixture,
} from '../../../test/lorawan.js';

let env: TestEnv;
let fx: LorawanFixture;
const base = '/api/v1';

beforeAll(async () => {
  env = await createTestEnv();
  fx = await setupLorawan(env, '10.50.0');
});
afterAll(async () => env.close());

describe('datos LoRaWAN del activo (RF-21)', () => {
  it('un activo nuevo no los exige y la ficha los muestra vacíos con los defaults del modelo', async () => {
    const a = await fx.newAsset();
    const res = await fx.operator.get(`${base}/assets/${a.id}/lorawan`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({
      devEui: null,
      hasAppKey: false,
      modelDefaults: { deviceClass: 'A', lorawanVersion: '1.0.3', region: 'AU915' },
      missingForRegistration: ['devEui', 'joinEui', 'appKey'],
      registration: null,
    });
  });

  it('guarda, normaliza y completa clase, versión y región desde el modelo', async () => {
    const a = await fx.newAsset();
    const res = await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, {
      devEui: '70:b3:d5:7e:d0:00:00:01',
      joinEui: JOIN_EUI.toLowerCase(),
      appKey: APP_KEY.toLowerCase(),
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      devEui: '70B3D57ED0000001',
      joinEui: JOIN_EUI,
      hasAppKey: true,
      hasNwkKey: false,
      deviceClass: 'A',
      lorawanVersion: '1.0.3',
      region: 'AU915',
      missingForRegistration: [],
    });
    expect(JSON.stringify(res.json())).not.toContain(APP_KEY);
  });

  it('las claves se guardan cifradas (no aparecen en claro en la base) con su key_id', async () => {
    const a = await fx.newAsset();
    await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, {
      devEui: devEui(2),
      appKey: APP_KEY,
      nwkKey: NWK_KEY,
    });
    const { rows } = await env.db.migratorPool.query(
      "SELECT app_key_enc, nwk_key_enc, key_id, encode(app_key_enc, 'escape') AS raw FROM asset_lorawan WHERE asset_id = $1",
      [a.id],
    );
    expect(rows[0].key_id).toBe('k1');
    expect(rows[0].app_key_enc.length).toBeGreaterThan(28);
    expect(rows[0].raw).not.toContain(APP_KEY);
    expect((rows[0].app_key_enc as Buffer).equals(rows[0].nwk_key_enc)).toBe(false);
  });

  it('valida el formato (400) y rechaza DevEUI repetido con el activo que lo usa (422)', async () => {
    const a = await fx.newAsset();
    const b = await fx.newAsset();
    expect(
      (await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, { devEui: '1234' })).statusCode,
    ).toBe(400);
    expect(
      (await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, { appKey: 'zz' })).statusCode,
    ).toBe(400);
    await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, { devEui: devEui(3) });
    const dup = await fx.operator.patch(`${base}/assets/${b.id}/lorawan`, { devEui: devEui(3) });
    expect(dup.statusCode).toBe(422);
    expect(dup.json().errors.devEui[0]).toContain(a.assetTag);
    // El mismo activo puede volver a guardar su propio DevEUI.
    expect(
      (await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, { devEui: devEui(3) })).statusCode,
    ).toBe(200);
  });

  it('null borra un campo; omitirlo lo deja igual; borrar una clave no toca la otra', async () => {
    const a = await fx.newAsset();
    await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, {
      devEui: devEui(4),
      appKey: APP_KEY,
      nwkKey: NWK_KEY,
    });
    const res = await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, {
      nwkKey: null,
      devEui: null,
    });
    expect(res.json()).toMatchObject({ devEui: null, hasAppKey: true, hasNwkKey: false });
    const reveal = await fx.admin.post(`${base}/assets/${a.id}/lorawan/reveal`);
    expect(reveal.json()).toEqual({ appKey: APP_KEY, nwkKey: null });
  });

  it('LoRaWAN 1.1 exige también la NwkKey para registrar', async () => {
    const a = await fx.newAsset();
    const res = await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, {
      devEui: devEui(5),
      joinEui: JOIN_EUI,
      appKey: APP_KEY,
      lorawanVersion: '1.1',
    });
    expect(res.json().missingForRegistration).toEqual(['nwkKey']);
  });

  it('un modelo sin categoría LoRaWAN no tiene esta sección (409)', async () => {
    const plain = (
      await fx.operator.post(`${base}/assets`, {
        name: 'NB',
        modelId: fx.ids.plainModel,
        statusId: fx.ids.status,
      })
    ).json();
    expect((await fx.operator.get(`${base}/assets/${plain.id}/lorawan`)).statusCode).toBe(409);
    expect(
      (await fx.operator.patch(`${base}/assets/${plain.id}/lorawan`, { devEui: devEui(6) }))
        .statusCode,
    ).toBe(409);
  });

  it('se pueden entregar al crear el activo, en la misma transacción', async () => {
    const a = await fx.newAsset({
      lorawan: { devEui: devEui(7), joinEui: JOIN_EUI, appKey: APP_KEY },
    });
    const res = await fx.operator.get(`${base}/assets/${a.id}/lorawan`);
    expect(res.json()).toMatchObject({ devEui: devEui(7), hasAppKey: true, deviceClass: 'A' });
    // Si falla (DevEUI repetido) no queda un activo a medias.
    const before = (await fx.operator.get(`${base}/assets?pageSize=1`)).json().meta.total;
    const bad = await fx.operator.post(`${base}/assets`, {
      name: 'X',
      modelId: fx.ids.model,
      statusId: fx.ids.status,
      lorawan: { devEui: devEui(7) },
    });
    expect(bad.statusCode).toBe(422);
    expect((await fx.operator.get(`${base}/assets?pageSize=1`)).json().meta.total).toBe(before);
    // Datos LoRaWAN en un modelo que no lo es.
    const wrong = await fx.operator.post(`${base}/assets`, {
      name: 'X',
      modelId: fx.ids.plainModel,
      statusId: fx.ids.status,
      lorawan: { devEui: devEui(8) },
    });
    expect(wrong.statusCode).toBe(422);
  });

  it('la edición queda en el historial sin claves; las claves solo dejan «cambió»', async () => {
    const a = await fx.newAsset();
    await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, {
      devEui: devEui(9),
      appKey: APP_KEY,
    });
    const history = (await fx.operator.get(`${base}/assets/${a.id}/history`)).json().data as {
      action: string;
      diff: Record<string, unknown>;
    }[];
    const entry = history.find((h) => h.action === 'lorawan.update')!;
    expect(entry.diff).toMatchObject({
      after: { devEui: devEui(9), appKeyChanged: true, hasAppKey: true },
    });
    const audit = await env.db.migratorPool.query('SELECT diff::text AS d FROM audit_log');
    for (const r of audit.rows) expect(String(r.d ?? '')).not.toContain(APP_KEY);
  });
});

describe('reveal de claves (RF-30)', () => {
  it('solo con lorawan:keys:reveal; queda auditado y sin caché', async () => {
    const a = await fx.newAsset();
    await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, {
      devEui: devEui(10),
      appKey: APP_KEY,
      nwkKey: NWK_KEY,
    });
    for (const c of [fx.operator, fx.tech, fx.reader]) {
      expect((await c.post(`${base}/assets/${a.id}/lorawan/reveal`)).statusCode).toBe(403);
    }
    const res = await fx.admin.post(`${base}/assets/${a.id}/lorawan/reveal`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual({ appKey: APP_KEY, nwkKey: NWK_KEY });
    const { rows } = await env.db.migratorPool.query(
      "SELECT actor_id, ip::text AS ip, diff, entity_label FROM audit_log WHERE action = 'lorawan.reveal_keys' AND entity_id = $1",
      [a.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).not.toBeNull();
    expect(rows[0].ip).toMatch(/^10\.50\.0\.1(\/32)?$/);
    expect(rows[0].diff).toEqual({ keys: ['appKey', 'nwkKey'] });
    expect(JSON.stringify(rows[0])).not.toContain(APP_KEY);
  });

  it('no se pueden leer ni editar sin los permisos correspondientes', async () => {
    const a = await fx.newAsset();
    expect((await fx.reader.get(`${base}/assets/${a.id}/lorawan`)).statusCode).toBe(200);
    expect(
      (await fx.tech.patch(`${base}/assets/${a.id}/lorawan`, { devEui: devEui(11) })).statusCode,
    ).toBe(403);
    expect(
      (await fx.reader.patch(`${base}/assets/${a.id}/lorawan`, { devEui: devEui(11) })).statusCode,
    ).toBe(403);
  });
});

describe('rotación de la clave maestra', () => {
  it('recifra con la clave vigente y las claves siguen siendo las mismas', async () => {
    const a = await fx.newAsset();
    await fx.operator.patch(`${base}/assets/${a.id}/lorawan`, {
      devEui: devEui(12),
      appKey: APP_KEY,
    });
    // Se prueba sobre la misma base: servicios nuevos con la configuración rotada.
    const { loadConfig } = await import('../../core/config.js');
    const { buildServices } = await import('../../core/container.js');
    const config = loadConfig({
      DATABASE_URL: env.config.databaseUrl,
      NODE_ENV: 'test',
      APP_ENCRYPTION_KEY: 'cd'.repeat(32),
      APP_ENCRYPTION_KEY_ID: 'k2',
      APP_ENCRYPTION_KEYS_PREVIOUS: `k1=${'ab'.repeat(32)}`,
    });
    const services = buildServices({ db: env.db.db, config });
    expect(await services.lorawan.reveal({ actorId: null, ip: null }, a.id)).toMatchObject({
      appKey: APP_KEY,
    });
    expect(await services.lorawan.reencryptAll()).toBeGreaterThanOrEqual(1);
    const { rows } = await env.db.migratorPool.query(
      'SELECT key_id FROM asset_lorawan WHERE asset_id = $1',
      [a.id],
    );
    expect(rows[0].key_id).toBe('k2');
    expect(await services.lorawan.reveal({ actorId: null, ip: null }, a.id)).toMatchObject({
      appKey: APP_KEY,
    });
    expect(await services.lorawan.reencryptAll()).toBe(0);
  });
});
