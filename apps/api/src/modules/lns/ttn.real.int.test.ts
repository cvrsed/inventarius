import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import type { LnsProfile, LorawanDeviceSecrets } from './adapter.js';
import { rejection } from './rejection.js';
import { TtnAdapter } from './ttn.js';

/**
 * Contra una aplicación REAL de TTN / The Things Stack v3 (job manual `ttn-real`, sin ejecutarse en CI normal).
 * Se activa con `TTN_TEST_ENDPOINT` y las demás variables `TTN_TEST_*` (secretos del repositorio en GitHub). Crea un
 * dispositivo con DevEUI aleatorio, lo busca, lo borra y comprueba que no quede nada: no toca otros dispositivos.
 */
const env = process.env;
const real = env['TTN_TEST_ENDPOINT'] && env['TTN_TEST_API_KEY'] && env['TTN_TEST_APPLICATION_ID'];

const need = (name: string): string => {
  const v = env[name];
  if (!v) throw new Error(`Falta la variable ${name}`);
  return v;
};

describe.skipIf(!real)('TTN real', () => {
  const adapter = new TtnAdapter(20_000);
  const profile = (): LnsProfile => ({
    id: 'p',
    kind: 'ttn',
    name: 'TTN real de prueba',
    endpoint: need('TTN_TEST_ENDPOINT'),
    tls: true,
    credential: need('TTN_TEST_API_KEY'),
    target: { applicationId: need('TTN_TEST_APPLICATION_ID') },
    deviceDefaults: {
      frequencyPlanId: need('TTN_TEST_FREQUENCY_PLAN_ID'),
      macVersion: env['TTN_TEST_MAC_VERSION'] ?? 'MAC_V1_0_3',
      phyVersion: env['TTN_TEST_PHY_VERSION'] ?? 'PHY_V1_0_3_REV_A',
      joinServerAddress: need('TTN_TEST_JOIN_SERVER'),
      networkServerAddress: need('TTN_TEST_NETWORK_SERVER'),
      applicationServerAddress: need('TTN_TEST_APPLICATION_SERVER'),
    },
  });
  const hex = (n: number) => randomBytes(n).toString('hex').toUpperCase();
  const device = (): LorawanDeviceSecrets => ({
    assetId: '0190a1b2-0000-7000-8000-0000000000aa',
    name: 'Inventarius prueba automática',
    description: 'Creado y borrado por la prueba automática de Inventarius',
    devEui: hex(8),
    joinEui: hex(8),
    appKey: hex(16),
    nwkKey: null,
    deviceClass: 'A',
    lorawanVersion: '1.0.3',
    region: null,
  });

  it('Probar conexión, registrar, encontrar, rechazar un duplicado y dar de baja', async () => {
    expect((await adapter.testConnection(profile())).ok).toBe(true);
    const d = device();
    try {
      expect(await adapter.findDevice(profile(), d.devEui)).toBeNull();
      const res = await adapter.registerDevice(profile(), d);
      expect(res.stepsDone).toEqual(['is', 'js', 'ns', 'as']);
      expect(await adapter.findDevice(profile(), d.devEui)).toEqual({
        externalId: res.externalId,
        inventariusAssetId: d.assetId,
      });
      const dup = await rejection(adapter.registerDevice(profile(), d));
      expect(dup.conflict).toBe(true);
      // El duplicado no debe haber borrado el dispositivo original.
      expect(await adapter.findDevice(profile(), d.devEui)).not.toBeNull();
    } finally {
      await adapter.deregisterDevice(profile(), {
        externalId: `inv-${d.devEui.toLowerCase()}`,
        devEui: d.devEui,
      });
    }
    expect(await adapter.findDevice(profile(), d.devEui)).toBeNull();
  });
});
