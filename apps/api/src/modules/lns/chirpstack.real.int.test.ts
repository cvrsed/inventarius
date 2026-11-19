import deviceGrpc from '@chirpstack/chirpstack-api/api/device_grpc_pb.js';
import devicePb from '@chirpstack/chirpstack-api/api/device_pb.js';
import { credentials, Metadata } from '@grpc/grpc-js';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { LnsProfile, LorawanDeviceSecrets } from './adapter.js';
import { ChirpstackAdapter } from './chirpstack.js';
import { rejection } from './rejection.js';

/**
 * Contra un ChirpStack v4 REAL de pruebas (el del compose de desarrollo o del e2e). Se activa con
 * `CHIRPSTACK_TEST_CONFIG=<json de scripts/chirpstack-bootstrap>`; sin la variable se omite.
 * Verifica lo que los dobles no pueden: dónde guarda ChirpStack las claves según la versión (sección 5.4, paso 3).
 */
const configPath = process.env['CHIRPSTACK_TEST_CONFIG'];
const real = configPath
  ? (JSON.parse(readFileSync(configPath, 'utf8')) as {
      endpoint: string;
      tenantId: string;
      applicationId: string;
      deviceProfileId: string;
      apiKey: string;
    })
  : null;

const APP_KEY = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
const NWK_KEY = '0F1E2D3C4B5A69788796A5B4C3D2E1F0';

describe.skipIf(!real)('ChirpStack v4 real', () => {
  const adapter = new ChirpstackAdapter(10_000);
  const profile = (): LnsProfile => ({
    id: 'p',
    kind: 'chirpstack',
    name: 'ChirpStack real de prueba',
    endpoint: real!.endpoint,
    tls: false,
    credential: real!.apiKey,
    target: { tenantId: real!.tenantId, applicationId: real!.applicationId },
    deviceDefaults: { deviceProfileId: real!.deviceProfileId },
  });
  const run = Date.now().toString(16).padStart(8, '0').slice(-8).toUpperCase();
  const device = (
    suffix: string,
    extra: Partial<LorawanDeviceSecrets> = {},
  ): LorawanDeviceSecrets => ({
    assetId: '0190a1b2-0000-7000-8000-0000000000aa',
    name: `INV-${run}-${suffix} Sensor de prueba`,
    description: 'Sensor de prueba',
    devEui: `70B3D5${run}${suffix}`.slice(0, 16).padEnd(16, '0'),
    joinEui: '8877665544332211',
    appKey: APP_KEY,
    nwkKey: null,
    deviceClass: 'A',
    lorawanVersion: '1.0.3',
    region: 'AU915',
    ...extra,
  });

  /** Claves tal como las guardó ChirpStack (lo que ve la UI de ChirpStack). */
  async function storedKeys(devEui: string): Promise<{ nwk: string; app: string }> {
    const client = new deviceGrpc.DeviceServiceClient(real!.endpoint, credentials.createInsecure());
    const meta = new Metadata();
    meta.set('authorization', `Bearer ${real!.apiKey}`);
    const req = new devicePb.GetDeviceKeysRequest();
    req.setDevEui(devEui.toLowerCase());
    try {
      const res = await new Promise<InstanceType<typeof devicePb.GetDeviceKeysResponse>>((ok, ko) =>
        client.getKeys(req, meta, (e, r) =>
          e || !r ? ko(e ?? new Error('sin respuesta')) : ok(r),
        ),
      );
      const k = res.getDeviceKeys()!;
      return { nwk: k.getNwkKey().toUpperCase(), app: k.getAppKey().toUpperCase() };
    } finally {
      client.close();
    }
  }

  /** El dispositivo tal como quedó en ChirpStack. */
  async function storedDevice(devEui: string) {
    const client = new deviceGrpc.DeviceServiceClient(real!.endpoint, credentials.createInsecure());
    const meta = new Metadata();
    meta.set('authorization', `Bearer ${real!.apiKey}`);
    const req = new devicePb.GetDeviceRequest();
    req.setDevEui(devEui.toLowerCase());
    try {
      const res = await new Promise<InstanceType<typeof devicePb.GetDeviceResponse>>((ok, ko) =>
        client.get(req, meta, (e, r) => (e || !r ? ko(e ?? new Error('sin respuesta')) : ok(r))),
      );
      const d = res.getDevice()!;
      return {
        joinEui: d.getJoinEui(),
        name: d.getName(),
        description: d.getDescription(),
        applicationId: d.getApplicationId(),
        deviceProfileId: d.getDeviceProfileId(),
        tags: Object.fromEntries(d.getTagsMap().entries()),
      };
    } finally {
      client.close();
    }
  }

  it('lo que se envía es lo que queda en ChirpStack, campo por campo', async () => {
    const d = device('04', { joinEui: '1122334455667788' });
    const res = await adapter.registerDevice(profile(), d);
    expect(await storedDevice(d.devEui)).toEqual({
      joinEui: d.joinEui.toLowerCase(),
      name: d.name,
      description: d.description,
      applicationId: real!.applicationId,
      deviceProfileId: real!.deviceProfileId,
      tags: { inventarius_asset_id: d.assetId },
    });
    // En 1.0.x ChirpStack guarda app_key en ceros.
    expect(await storedKeys(d.devEui)).toEqual({ nwk: APP_KEY, app: '0'.repeat(32) });
    await adapter.deregisterDevice(profile(), { externalId: res.externalId, devEui: d.devEui });
  });

  it('Probar conexión valida tenant, aplicación y device profile', async () => {
    const res = await adapter.testConnection(profile());
    expect(res.checks).toEqual([
      { name: 'tenant', ok: true, detail: null },
      { name: 'application', ok: true, detail: null },
      { name: 'deviceProfile', ok: true, detail: null },
    ]);
    const bad = await adapter.testConnection({ ...profile(), credential: 'clave-incorrecta' });
    expect(bad.ok).toBe(false);
    expect(bad.checks[0]!.detail).toMatch(/credencial/);
  });

  it('LoRaWAN 1.0.x: la AppKey queda en nwk_key (Application key en la UI de ChirpStack)', async () => {
    const d = device('01');
    expect(await adapter.findDevice(profile(), d.devEui)).toBeNull();
    const res = await adapter.registerDevice(profile(), d);
    expect(res).toEqual({ externalId: d.devEui.toLowerCase(), stepsDone: ['device', 'keys'] });
    expect((await storedKeys(d.devEui)).nwk).toBe(APP_KEY);
    expect(await adapter.findDevice(profile(), d.devEui)).toEqual({
      externalId: d.devEui.toLowerCase(),
      inventariusAssetId: d.assetId,
    });
    // Registrar de nuevo: el LNS dice ALREADY_EXISTS y el adaptador lo marca como conflicto.
    const dup = await rejection(adapter.registerDevice(profile(), d));
    expect(dup.conflict).toBe(true);
    await adapter.deregisterDevice(profile(), { externalId: res.externalId, devEui: d.devEui });
    expect(await adapter.findDevice(profile(), d.devEui)).toBeNull();
    // Borrar lo que ya no existe no es error.
    await adapter.deregisterDevice(profile(), { externalId: res.externalId, devEui: d.devEui });
  });

  it('LoRaWAN 1.1: NwkKey en nwk_key y AppKey en app_key', async () => {
    const d = device('02', { lorawanVersion: '1.1', nwkKey: NWK_KEY });
    const res = await adapter.registerDevice(profile(), d);
    expect(await storedKeys(d.devEui)).toEqual({ nwk: NWK_KEY, app: APP_KEY });
    await adapter.deregisterDevice(profile(), { externalId: res.externalId, devEui: d.devEui });
  });

  it('si CreateKeys falla compensa: el dispositivo no queda en ChirpStack', async () => {
    const d = device('03', { appKey: 'no-es-hexadecimal' });
    const err = await rejection(adapter.registerDevice(profile(), d));
    expect(err.orphans).toEqual([]);
    expect(await adapter.findDevice(profile(), d.devEui)).toBeNull();
  });
});
