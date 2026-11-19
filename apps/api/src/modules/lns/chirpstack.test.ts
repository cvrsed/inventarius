import applicationGrpc from '@chirpstack/chirpstack-api/api/application_grpc_pb.js';
import applicationPb from '@chirpstack/chirpstack-api/api/application_pb.js';
import deviceGrpc from '@chirpstack/chirpstack-api/api/device_grpc_pb.js';
import devicePb from '@chirpstack/chirpstack-api/api/device_pb.js';
import profileGrpc from '@chirpstack/chirpstack-api/api/device_profile_grpc_pb.js';
import profilePb from '@chirpstack/chirpstack-api/api/device_profile_pb.js';
import tenantGrpc from '@chirpstack/chirpstack-api/api/tenant_grpc_pb.js';
import commonPb from '@chirpstack/chirpstack-api/common/common_pb.js';
import tenantPb from '@chirpstack/chirpstack-api/api/tenant_pb.js';
import {
  Server,
  ServerCredentials,
  status,
  type ServerUnaryCall,
  type sendUnaryData,
} from '@grpc/grpc-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChirpstackAdapter } from './chirpstack.js';
import { rejection } from './rejection.js';
import { LnsOperationError, type LnsProfile, type LorawanDeviceSecrets } from './adapter.js';

const API_KEY = 'clave-api-de-prueba';
const DEV_EUI = '0011223344556677';
const TENANT = '0190a1b2-0000-7000-8000-000000000001';
const APP = '0190a1b2-0000-7000-8000-000000000002';
const DP = '0190a1b2-0000-7000-8000-000000000003';

type Call<R> = ServerUnaryCall<R, unknown>;
type Reply = sendUnaryData<unknown>;
type CreateReq = InstanceType<typeof devicePb.CreateDeviceRequest>;
type KeysReq = InstanceType<typeof devicePb.CreateDeviceKeysRequest>;
type IdReq = { getId(): string };

/** Servidor gRPC de prueba con la API de ChirpStack v4: registra llamadas y falla donde se le pide. */
class FakeChirpstack {
  calls: string[] = [];
  keys: { nwk: string; app: string } | null = null;
  device: {
    name: string;
    description: string;
    joinEui: string;
    applicationId: string;
    deviceProfileId: string;
    tags: Record<string, string>;
  } | null = null;
  /** `método` -> código gRPC a devolver. */
  failures = new Map<string, number>();
  failureDetails = new Map<string, string>();
  authSeen: string[] = [];
  /** Device profile que devuelve `deviceProfile.get`. */
  dp: { name: string; region: number; macVersion: number; classB: boolean; classC: boolean } = {
    name: 'Perfil AU915',
    region: commonPb.Region.AU915,
    macVersion: commonPb.MacVersion.LORAWAN_1_0_3,
    classB: false,
    classC: false,
  };
  server = new Server();
  port = 0;

  private wrap<R>(
    method: string,
    ok: (call: Call<R>, cb: Reply) => void,
  ): (call: Call<R>, cb: Reply) => void {
    return (call, cb) => {
      this.calls.push(method);
      this.authSeen.push(String(call.metadata.get('authorization')[0]));
      const code = this.failures.get(method);
      if (code !== undefined)
        return cb({ code, details: this.failureDetails.get(method) ?? 'falla simulada' });
      ok(call, cb);
    };
  }

  constructor() {
    this.server.addService(deviceGrpc.DeviceServiceService, {
      create: this.wrap<CreateReq>('create', (call, cb) => {
        const d = call.request.getDevice()!;
        this.device = {
          name: d.getName(),
          description: d.getDescription(),
          joinEui: d.getJoinEui(),
          applicationId: d.getApplicationId(),
          deviceProfileId: d.getDeviceProfileId(),
          tags: Object.fromEntries(d.getTagsMap().entries()),
        };
        cb(null, new (require_empty())());
      }),
      get: this.wrap('get', (_c, cb) => {
        if (!this.device) return cb({ code: status.NOT_FOUND, details: 'no existe' });
        const res = new devicePb.GetDeviceResponse();
        const d = new devicePb.Device();
        d.setName(this.device.name);
        d.setJoinEui(this.device.joinEui);
        d.setDeviceProfileId(this.device.deviceProfileId);
        for (const [k, v] of Object.entries(this.device.tags)) d.getTagsMap().set(k, v);
        res.setDevice(d);
        cb(null, res);
      }),
      getKeys: this.wrap('getKeys', (_c, cb) => {
        if (!this.keys) return cb({ code: status.NOT_FOUND, details: 'sin claves' });
        const res = new devicePb.GetDeviceKeysResponse();
        const k = new devicePb.DeviceKeys();
        k.setNwkKey(this.keys.nwk);
        k.setAppKey(this.keys.app);
        res.setDeviceKeys(k);
        cb(null, res);
      }),
      createKeys: this.wrap<KeysReq>('createKeys', (call, cb) => {
        const k = call.request.getDeviceKeys()!;
        this.keys = { nwk: k.getNwkKey(), app: k.getAppKey() };
        cb(null, new (require_empty())());
      }),
      delete: this.wrap('delete', (_c, cb) => {
        if (!this.device) return cb({ code: status.NOT_FOUND, details: 'no existe' });
        this.device = null;
        cb(null, new (require_empty())());
      }),
    } as never);
    this.server.addService(tenantGrpc.TenantServiceService, {
      get: this.wrap<IdReq>('tenant.get', (call, cb) =>
        call.request.getId() === TENANT
          ? cb(null, new tenantPb.GetTenantResponse())
          : cb({ code: status.NOT_FOUND, details: 'tenant' }),
      ),
    } as never);
    this.server.addService(applicationGrpc.ApplicationServiceService, {
      get: this.wrap<IdReq>('application.get', (call, cb) =>
        call.request.getId() === APP
          ? cb(null, new applicationPb.GetApplicationResponse())
          : cb({ code: status.NOT_FOUND, details: 'app' }),
      ),
    } as never);
    this.server.addService(profileGrpc.DeviceProfileServiceService, {
      get: this.wrap<IdReq>('deviceProfile.get', (call, cb) => {
        if (call.request.getId() !== DP) return cb({ code: status.NOT_FOUND, details: 'dp' });
        const dp = new profilePb.DeviceProfile();
        dp.setId(DP);
        dp.setName(this.dp.name);
        dp.setRegion(this.dp.region as never);
        dp.setMacVersion(this.dp.macVersion as never);
        dp.setSupportsClassB(this.dp.classB);
        dp.setSupportsClassC(this.dp.classC);
        const res = new profilePb.GetDeviceProfileResponse();
        res.setDeviceProfile(dp);
        cb(null, res);
      }),
    } as never);
  }

  async start(): Promise<void> {
    this.port = await new Promise<number>((resolve, reject) =>
      this.server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (e, p) =>
        e ? reject(e) : resolve(p),
      ),
    );
  }
  stop = () => new Promise<void>((r) => this.server.tryShutdown(() => r()));
}

import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
function require_empty(): new () => object {
  return req('google-protobuf/google/protobuf/empty_pb.js').Empty;
}

const device: LorawanDeviceSecrets = {
  assetId: '0190a1b2-0000-7000-8000-0000000000aa',
  name: 'INV-000001 Sensor de prueba',
  description: 'Sensor de prueba',
  devEui: DEV_EUI,
  joinEui: '8877665544332211',
  appKey: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
  nwkKey: null,
  deviceClass: 'A',
  lorawanVersion: '1.0.3',
  region: 'AU915',
};

let fake: FakeChirpstack;
let profile: LnsProfile;
const adapter = new ChirpstackAdapter(2000);

beforeEach(async () => {
  fake = new FakeChirpstack();
  await fake.start();
  profile = {
    id: 'p1',
    kind: 'chirpstack',
    name: 'ChirpStack de prueba',
    endpoint: `127.0.0.1:${fake.port}`,
    tls: false,
    credential: API_KEY,
    target: { tenantId: TENANT, applicationId: APP },
    deviceDefaults: { deviceProfileId: DP },
  };
});
afterEach(() => fake.stop());

const failure = async () => {
  const e = await adapter.registerDevice(profile, device).catch((x: unknown) => x);
  expect(e).toBeInstanceOf(LnsOperationError);
  return e as LnsOperationError;
};

describe('ChirpStack: leer un dispositivo existente (vincular)', () => {
  const NWK = '0F1E2D3C4B5A69788796A5B4C3D2E1F0';
  const seed = (keys: { nwk: string; app: string } | null) => {
    fake.device = {
      name: 'Medidor ajeno',
      description: '',
      joinEui: '8877665544332211',
      applicationId: APP,
      deviceProfileId: DP,
      tags: {},
    };
    fake.keys = keys;
  };

  it('devuelve nombre, JoinEUI, device profile y claves, sin escribir nada', async () => {
    expect(await adapter.readDevice(profile, DEV_EUI, '1.0.3')).toBeNull();
    seed({ nwk: device.appKey.toLowerCase(), app: '0'.repeat(32) });
    expect(await adapter.readDevice(profile, DEV_EUI, '1.0.3')).toEqual({
      externalId: DEV_EUI.toLowerCase(),
      name: 'Medidor ajeno',
      joinEui: '8877665544332211',
      deviceProfileId: DP,
      inventariusAssetId: null,
      // En 1.0.x la AppKey está en nwk_key; app_key en ceros no cuenta.
      appKey: device.appKey,
      nwkKey: null,
    });
    expect(
      fake.calls.filter((c) => c !== 'get' && c !== 'getKeys' && c !== 'application.get'),
    ).toEqual([]);
  });

  it('en 1.1 la AppKey es app_key y la NwkKey, nwk_key', async () => {
    seed({ nwk: NWK, app: device.appKey });
    expect(await adapter.readDevice(profile, DEV_EUI, '1.1')).toMatchObject({
      appKey: device.appKey,
      nwkKey: NWK,
    });
  });

  it('sin claves en ChirpStack (NOT_FOUND) o en ceros: «no están», no un error', async () => {
    seed(null);
    expect(await adapter.readDevice(profile, DEV_EUI, '1.0.3')).toMatchObject({
      appKey: null,
      nwkKey: null,
    });
    seed({ nwk: '0'.repeat(32), app: '0'.repeat(32) });
    expect(await adapter.readDevice(profile, DEV_EUI, '1.1')).toMatchObject({
      appKey: null,
      nwkKey: null,
    });
  });

  it('si ChirpStack falla, lo informa legible', async () => {
    seed(null);
    fake.failures.set('get', status.UNAVAILABLE);
    const e = await rejection(adapter.readDevice(profile, DEV_EUI, '1.0.3'));
    expect(e.transient).toBe(true);
  });
});

describe('ChirpStack: device profile', () => {
  it('lee versión, región y clases del device profile y los traduce a los de Inventarius', async () => {
    expect(await adapter.describeDeviceProfile(profile)).toEqual({
      id: DP,
      name: 'Perfil AU915',
      version: '1.0.3',
      region: 'AU915',
      classes: ['A'],
      versionLabel: 'LoRaWAN 1.0.3',
      regionLabel: 'AU915',
    });
    fake.dp = {
      name: 'Perfil 1.1',
      region: commonPb.Region.AS923_2,
      macVersion: commonPb.MacVersion.LORAWAN_1_1_0,
      classB: true,
      classC: true,
    };
    expect(await adapter.describeDeviceProfile(profile)).toMatchObject({
      version: '1.1',
      region: 'AS923-2',
      classes: ['A', 'B', 'C'],
    });
  });

  it('una región que Inventarius no conoce queda sin traducir pero se muestra como la tiene el LNS', async () => {
    fake.dp.region = commonPb.Region.ISM2400;
    expect(await adapter.describeDeviceProfile(profile)).toMatchObject({
      region: null,
      regionLabel: 'ISM2400',
    });
  });

  it('un device profile que no existe es un error legible', async () => {
    const e = await adapter
      .describeDeviceProfile({ ...profile, deviceDefaults: { deviceProfileId: 'otro' } })
      .catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LnsOperationError);
    expect((e as LnsOperationError).message).toMatch(/no encontró/);
  });
});

describe('ChirpStack: registro', () => {
  it('crea el dispositivo con su etiqueta y luego las claves, con la API key', async () => {
    const res = await adapter.registerDevice(profile, device);
    expect(res).toEqual({ externalId: DEV_EUI.toLowerCase(), stepsDone: ['device', 'keys'] });
    expect(fake.calls).toEqual(['create', 'createKeys']);
    expect(new Set(fake.authSeen)).toEqual(new Set([`Bearer ${API_KEY}`]));
  });

  it('envía al LNS, campo por campo, lo mismo que tiene el dispositivo (incluido el JoinEUI)', async () => {
    await adapter.registerDevice(profile, device);
    expect(fake.device).toEqual({
      name: device.name,
      description: device.description,
      joinEui: device.joinEui.toLowerCase(),
      applicationId: APP,
      deviceProfileId: DP,
      tags: { inventarius_asset_id: device.assetId },
    });
    expect(fake.keys).toEqual({ nwk: device.appKey, app: '' });
  });

  it('en 1.0.x la AppKey va en nwk_key; en 1.1 van nwk_key y app_key', async () => {
    await adapter.registerDevice(profile, device);
    expect(fake.keys).toEqual({ nwk: device.appKey, app: '' });
    const nwk = '00112233445566778899AABBCCDDEEFF';
    await adapter.registerDevice(profile, { ...device, lorawanVersion: '1.1', nwkKey: nwk });
    expect(fake.keys).toEqual({ nwk, app: device.appKey });
  });

  it('si falla CreateKeys compensa borrando el dispositivo', async () => {
    fake.failures.set('createKeys', status.INVALID_ARGUMENT);
    const err = await failure();
    expect(fake.calls).toEqual(['create', 'createKeys', 'delete']);
    expect(fake.device).toBeNull();
    expect(err.orphans).toEqual([]);
    expect(err.transient).toBe(false);
  });

  it('si además falla el borrado, queda parcial con el dispositivo huérfano', async () => {
    fake.failures.set('createKeys', status.INVALID_ARGUMENT);
    fake.failures.set('delete', status.UNAVAILABLE);
    const err = await failure();
    expect(err.orphans).toEqual(['device']);
    expect(err.stepsDone).toEqual(['device']);
  });

  it('si falla Create no hay nada que compensar; ALREADY_EXISTS es conflicto', async () => {
    fake.failures.set('create', status.ALREADY_EXISTS);
    const err = await failure();
    expect(fake.calls).toEqual(['create']);
    expect(err.conflict).toBe(true);
  });

  it('ChirpStack real responde INTERNAL con «duplicate key» ante un DevEUI repetido: es conflicto, no se reintenta', async () => {
    fake.failures.set('create', status.INTERNAL);
    fake.failureDetails.set(
      'create',
      'duplicate key value violates unique constraint "device_pkey"',
    );
    const err = await failure();
    expect(err.conflict).toBe(true);
    expect(err.transient).toBe(false);
    fake.failureDetails.clear();
    expect((await failure()).transient).toBe(true); // otro INTERNAL sí es transitorio
  });

  it('INTERNAL que no es duplicado: el mensaje visible es genérico y e.details queda solo en la causa', async () => {
    fake.failures.set('create', status.INTERNAL);
    fake.failureDetails.set('create', 'violates foreign key constraint "device_dp_fkey"');
    const err = await failure();
    expect(err.message).not.toContain('device_dp_fkey');
    expect(err.message).toMatch(/error interno/);
    expect((err.cause as { details: string }).details).toContain('device_dp_fkey');
  });

  it('un código sin mensaje propio (default) es genérico y no incluye e.details', async () => {
    fake.failures.set('create', status.FAILED_PRECONDITION);
    fake.failureDetails.set('create', 'constraint "device_profile_fkey" detalle crudo');
    const err = await failure();
    expect(err.message).not.toContain('device_profile_fkey');
    expect(err.message).toContain('FAILED_PRECONDITION');
    expect((err.cause as { details: string }).details).toContain('device_profile_fkey');
  });

  it('UNAVAILABLE y DEADLINE_EXCEEDED son transitorios; INVALID_ARGUMENT y UNAUTHENTICATED no', async () => {
    for (const [code, transient] of [
      [status.UNAVAILABLE, true],
      [status.DEADLINE_EXCEEDED, true],
      [status.INVALID_ARGUMENT, false],
      [status.UNAUTHENTICATED, false],
    ] as const) {
      fake.failures.set('create', code);
      expect((await failure()).transient).toBe(transient);
    }
  });
});

describe('ChirpStack: consulta, baja y conexión', () => {
  it('findDevice: null si no existe y reconoce lo creado por Inventarius', async () => {
    expect(await adapter.findDevice(profile, DEV_EUI)).toBeNull();
    await adapter.registerDevice(profile, device);
    expect(await adapter.findDevice(profile, DEV_EUI)).toEqual({
      externalId: DEV_EUI.toLowerCase(),
      inventariusAssetId: device.assetId,
    });
    fake.device = {
      name: 'ajeno',
      description: '',
      joinEui: '',
      applicationId: APP,
      deviceProfileId: DP,
      tags: {},
    };
    expect((await adapter.findDevice(profile, DEV_EUI))!.inventariusAssetId).toBeNull();
  });

  it('deregister borra; si ya no existe no es error; si falla lo informa', async () => {
    await adapter.registerDevice(profile, device);
    await adapter.deregisterDevice(profile, { externalId: DEV_EUI.toLowerCase(), devEui: DEV_EUI });
    expect(fake.device).toBeNull();
    await adapter.deregisterDevice(profile, { externalId: DEV_EUI.toLowerCase(), devEui: DEV_EUI });
    fake.failures.set('delete', status.UNAVAILABLE);
    const err = await rejection(
      adapter.deregisterDevice(profile, { externalId: DEV_EUI.toLowerCase(), devEui: DEV_EUI }),
    );
    expect(err.orphans).toEqual(['device']);
    expect(err.transient).toBe(true);
  });

  it('UNAUTHENTICATED al pedir un dispositivo inexistente: con la credencial válida es «no existe»', async () => {
    fake.failures.set('get', status.UNAUTHENTICATED);
    expect(await adapter.findDevice(profile, DEV_EUI)).toBeNull();
    fake.failures.set('delete', status.UNAUTHENTICATED);
    await adapter.deregisterDevice(profile, { externalId: DEV_EUI.toLowerCase(), devEui: DEV_EUI });
  });

  it('PERMISSION_DENIED en get y en delete es error de permisos, no «no existe»: no se consulta la aplicación', async () => {
    const ref = { externalId: DEV_EUI.toLowerCase(), devEui: DEV_EUI };
    fake.failures.set('get', status.PERMISSION_DENIED);
    const getErr = await rejection(adapter.findDevice(profile, DEV_EUI));
    expect(getErr.message).toMatch(/permisos/);
    expect(getErr.transient).toBe(false);
    fake.failures.set('delete', status.PERMISSION_DENIED);
    const delErr = await rejection(adapter.deregisterDevice(profile, ref));
    expect(delErr.message).toMatch(/permisos/);
    expect(delErr.transient).toBe(false);
    expect(fake.calls).not.toContain('application.get');
  });

  it('UNAUTHENTICATED con la credencial realmente inválida sigue siendo error de credencial', async () => {
    fake.failures.set('get', status.UNAUTHENTICATED);
    fake.failures.set('application.get', status.UNAUTHENTICATED);
    const err = await rejection(adapter.findDevice(profile, DEV_EUI));
    expect(err.message).toMatch(/credencial/);
    expect(err.transient).toBe(false);
  });

  it('probar conexión valida tenant, aplicación y device profile', async () => {
    const ok = await adapter.testConnection(profile);
    expect(ok.ok).toBe(true);
    expect(ok.checks.map((c) => c.name)).toEqual(['tenant', 'application', 'deviceProfile']);
    const bad = await adapter.testConnection({
      ...profile,
      target: { tenantId: TENANT, applicationId: '0190a1b2-0000-7000-8000-00000000ffff' },
    });
    expect(bad.ok).toBe(false);
    expect(bad.checks.find((c) => c.name === 'application')!.detail).toMatch(/no encontró/);
    expect(JSON.stringify(bad)).not.toContain(API_KEY);
  });

  it('credencial rechazada: mensaje legible', async () => {
    fake.failures.set('tenant.get', status.UNAUTHENTICATED);
    const res = await adapter.testConnection(profile);
    expect(res.checks[0]!.detail).toMatch(/credencial/);
  });

  it('servidor caído: no lanza al probar; findDevice es error transitorio', async () => {
    const down = { ...profile, endpoint: '127.0.0.1:1' };
    expect((await adapter.testConnection(down)).ok).toBe(false);
    const err = await rejection(adapter.findDevice(down, DEV_EUI));
    expect(err.transient).toBe(true);
  });
});
