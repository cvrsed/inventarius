import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejection } from './rejection.js';
import { LnsOperationError, type LnsProfile, type LorawanDeviceSecrets } from './adapter.js';
import { TtnAdapter } from './ttn.js';

interface Call {
  method: string;
  path: string;
  auth: string | undefined;
  body: Record<string, unknown> | null;
}

/** Servidor HTTP de prueba que imita a The Things Stack: registra cada llamada y falla donde se le pide. */
class FakeTtn {
  calls: Call[] = [];
  /** `METHOD ruta-que-contiene` -> estado HTTP a devolver. */
  failures = new Map<string, number>();
  existing: Record<string, unknown> | null = null;
  server: Server;
  constructor() {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const call: Call = {
          method: req.method ?? '',
          path: req.url ?? '',
          auth: req.headers.authorization,
          body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null,
        };
        this.calls.push(call);
        for (const [key, status] of this.failures) {
          const [m, part] = key.split(' ') as [string, string];
          if (m === call.method && call.path.includes(part)) {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ code: 3, message: 'falla simulada' }));
            return;
          }
        }
        if (call.method === 'GET' && call.path.includes('/devices/')) {
          if (!this.existing) {
            res.writeHead(404, { 'content-type': 'application/json' });
            res.end('{"code":5,"message":"no existe"}');
            return;
          }
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(this.existing));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{}');
      });
    });
  }
  async start(): Promise<string> {
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }
  stop = () => new Promise((r) => this.server.close(r));
  /** Componente y método de cada llamada de escritura, p. ej. `POST is`. */
  get writes(): string[] {
    return this.calls
      .filter((c) => c.method !== 'GET')
      .map((c) => `${c.method} ${/\/api\/v3\/(js|ns|as)\//.exec(c.path)?.[1] ?? 'is'}`);
  }
}

/** Lee un valor anidado de un JSON de petición por su ruta con puntos. */
const dig = (o: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((a, k) => (a as Record<string, unknown> | undefined)?.[k], o);

const DEV_EUI = '0011223344556677';
const APP_KEY = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
const device: LorawanDeviceSecrets = {
  assetId: '0190a1b2-0000-7000-8000-0000000000aa',
  name: 'INV-000001 Sensor de prueba',
  description: 'Sensor de prueba',
  devEui: DEV_EUI,
  joinEui: '8877665544332211',
  appKey: APP_KEY,
  nwkKey: null,
  deviceClass: 'A',
  lorawanVersion: '1.0.3',
  region: 'AU915',
};

let fake: FakeTtn;
let profile: LnsProfile;
const adapter = new TtnAdapter(2000);

beforeEach(async () => {
  fake = new FakeTtn();
  const endpoint = await fake.start();
  profile = {
    id: 'p1',
    kind: 'ttn',
    name: 'TTN de prueba',
    endpoint,
    tls: false,
    credential: 'NNSXS.CLAVE-DE-PRUEBA',
    target: { applicationId: 'app-prueba' },
    deviceDefaults: {
      frequencyPlanId: 'AU_915_928_FSB_2',
      macVersion: 'MAC_V1_0_3',
      phyVersion: 'PHY_V1_0_3_REV_A',
      joinServerAddress: 'js.example.test',
      networkServerAddress: 'ns.example.test',
      applicationServerAddress: 'as.example.test',
    },
  };
});
afterEach(() => fake.stop());

const STEPS = ['is', 'js', 'ns', 'as'] as const;
const FAIL_KEY = {
  is: 'POST /devices',
  js: 'PUT /js/',
  ns: 'PUT /ns/',
  as: 'PUT /as/',
} as const;

async function failure(): Promise<LnsOperationError> {
  const err = await adapter.registerDevice(profile, device).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(LnsOperationError);
  return err as LnsOperationError;
}

describe('TTN: registro', () => {
  it('crea IS, JS, NS y AS en orden, con field_mask y credencial', async () => {
    const res = await adapter.registerDevice(profile, device);
    expect(res).toEqual({ externalId: `inv-${DEV_EUI.toLowerCase()}`, stepsDone: [...STEPS] });
    expect(fake.writes).toEqual(['POST is', 'PUT js', 'PUT ns', 'PUT as']);
    for (const c of fake.calls) {
      expect(c.auth).toBe('Bearer NNSXS.CLAVE-DE-PRUEBA');
      expect(
        (c.body as { field_mask?: { paths: string[] } }).field_mask?.paths.length,
      ).toBeGreaterThan(0);
    }
    const body = (i: number) => fake.calls[i]!.body;
    expect(dig(body(0), 'end_device.attributes.inventarius-asset-id')).toBe(device.assetId);
    expect(JSON.stringify(body(0))).not.toContain(APP_KEY);
    expect(dig(body(1), 'end_device.root_keys.app_key.key')).toBe(APP_KEY);
    expect(dig(body(2), 'end_device.lorawan_version')).toBe('MAC_V1_0_3');
    expect(dig(body(2), 'end_device.frequency_plan_id')).toBe('AU_915_928_FSB_2');
  });

  it('en LoRaWAN 1.1 envía también la NwkKey', async () => {
    const nwk = '00112233445566778899AABBCCDDEEFF';
    await adapter.registerDevice(profile, { ...device, lorawanVersion: '1.1', nwkKey: nwk });
    expect(dig(fake.calls[1]!.body, 'end_device.root_keys.nwk_key.key')).toBe(nwk);
    expect(dig(fake.calls[2]!.body, 'end_device.lorawan_version')).toBe('MAC_V1_1');
  });

  // Compensación probada simulando el fallo en cada paso (sección 13).
  for (const [i, step] of STEPS.entries()) {
    it(`si falla ${step.toUpperCase()}: borra en orden inverso solo lo ya creado y no deja huérfanos`, async () => {
      fake.failures.set(FAIL_KEY[step], 400);
      const err = await failure();
      const created = STEPS.slice(0, i);
      expect(fake.writes.slice(i + 1)).toEqual([...created].reverse().map((s) => `DELETE ${s}`));
      expect(err.orphans).toEqual([]);
      expect(err.transient).toBe(false);
      expect(err.message).toContain('falla simulada');
    });

    if (i > 0) {
      it(`si falla ${step.toUpperCase()} y también el borrado del paso anterior: queda parcial con el huérfano`, async () => {
        fake.failures.set(FAIL_KEY[step], 400);
        const previous = STEPS[i - 1]!;
        fake.failures.set(`DELETE ${previous === 'is' ? '/devices/' : `/${previous}/`}`, 500);
        const err = await failure();
        expect(err.orphans).toEqual([previous]);
        expect(err.stepsDone).toEqual(STEPS.slice(0, i));
        expect(err.transient).toBe(false);
      });
    }
  }

  it('un 409 al crear en IS es conflicto', async () => {
    fake.failures.set('POST /devices', 409);
    const err = await failure();
    expect(err.conflict).toBe(true);
    expect(fake.writes).toEqual(['POST is']);
  });

  it('5xx es transitorio; 4xx no', async () => {
    fake.failures.set('PUT /ns/', 503);
    expect((await failure()).transient).toBe(true);
    fake.failures.clear();
    fake.failures.set('PUT /ns/', 422);
    expect((await failure()).transient).toBe(false);
  });

  it('sin respuesta (timeout) es transitorio y también intenta borrar el paso ambiguo', async () => {
    const slow = new TtnAdapter(50);
    const orig = fake.server.listeners('request')[0] as (...a: unknown[]) => void;
    fake.server.removeAllListeners('request');
    fake.server.on('request', (req, res) => {
      if (req.method === 'PUT' && req.url?.includes('/js/')) return; // nunca responde
      orig(req, res);
    });
    const err = await rejection(slow.registerDevice(profile, device));
    expect(err.transient).toBe(true);
    // El PUT que nunca responde no llega a registrarse en el doble; lo que importa es el borrado.
    expect(fake.writes).toEqual(['POST is', 'DELETE js', 'DELETE is']);
  });
});

describe('TTN: consulta, baja y conexión', () => {
  it('findDevice: null si no existe; reconoce lo que creó Inventarius', async () => {
    expect(await adapter.findDevice(profile, DEV_EUI)).toBeNull();
    fake.existing = { attributes: { 'inventarius-asset-id': device.assetId } };
    expect(await adapter.findDevice(profile, DEV_EUI)).toEqual({
      externalId: `inv-${DEV_EUI.toLowerCase()}`,
      inventariusAssetId: device.assetId,
    });
    fake.existing = { attributes: {} };
    expect((await adapter.findDevice(profile, DEV_EUI))!.inventariusAssetId).toBeNull();
  });

  it('baja: AS → NS → JS → IS, y lo que ya no existe (404) no es error', async () => {
    fake.failures.set('DELETE /ns/', 404);
    await adapter.deregisterDevice(profile, { externalId: 'inv-x', devEui: DEV_EUI });
    expect(fake.writes).toEqual(['DELETE as', 'DELETE ns', 'DELETE js', 'DELETE is']);
  });

  it('baja con un componente que no se pudo borrar: lo informa y sigue con los demás', async () => {
    fake.failures.set('DELETE /js/', 500);
    const err = await rejection(
      adapter.deregisterDevice(profile, { externalId: 'inv-x', devEui: DEV_EUI }),
    );
    expect(err.orphans).toEqual(['js']);
    expect(fake.writes).toHaveLength(4);
  });

  it('probar conexión: ok, y credencial rechazada con mensaje legible', async () => {
    const ok = await adapter.testConnection(profile);
    expect(ok.ok).toBe(true);
    expect(ok.checks).toEqual([{ name: 'application', ok: true, detail: null }]);
    fake.failures.set('GET /api/v3/applications/app-prueba', 401);
    const bad = await adapter.testConnection(profile);
    expect(bad.ok).toBe(false);
    expect(bad.checks[0]!.detail).toMatch(/credencial/);
    expect(JSON.stringify(bad)).not.toContain('NNSXS');
  });

  it('endpoint inalcanzable: error transitorio, sin lanzar al probar', async () => {
    const down = { ...profile, endpoint: 'http://127.0.0.1:1' };
    const res = await adapter.testConnection(down);
    expect(res.ok).toBe(false);
    const err = await rejection(adapter.findDevice(down, DEV_EUI));
    expect(err.transient).toBe(true);
  });

  it('describeDeviceProfile: la región sale del plan de frecuencias; versión y clase las pone el activo', async () => {
    const info = await adapter.describeDeviceProfile(profile);
    expect(info).toMatchObject({ region: 'AU915', version: null, classes: null });
    expect(
      (
        await adapter.describeDeviceProfile({
          ...profile,
          deviceDefaults: { ...profile.deviceDefaults, frequencyPlanId: 'EU_863_870_TTN' },
        })
      ).region,
    ).toBe('EU868');
    expect(
      (
        await adapter.describeDeviceProfile({
          ...profile,
          deviceDefaults: { ...profile.deviceDefaults, frequencyPlanId: 'PLAN_DESCONOCIDO' },
        })
      ).region,
    ).toBeNull();
  });
});
