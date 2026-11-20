import type { RegistrationPreviewDto } from '@inventarius/shared';
import { describe, expect, it } from 'vitest';
import { previewRows } from './preview';

const t = (k: string) =>
  ({
    'lorawan.notSet': 'Sin definir',
    'lns.kinds.chirpstack': 'ChirpStack',
    'lorawan.registerDialog.previewFields.profile': 'Perfil LNS',
    'lorawan.registerDialog.previewFields.nwkKey': 'NwkKey',
  })[k] ?? k;
const tNamed = (k: string, named?: Record<string, unknown>) =>
  k === 'lorawan.registerDialog.fromDeviceProfile'
    ? `${named?.['value']}, del device profile`
    : t(k);

const base: RegistrationPreviewDto = {
  profile: { id: '018f0000-0000-7000-8000-0000000000aa', name: 'CS', kind: 'chirpstack' },
  deviceName: 'INV-1 Sensor',
  description: '',
  externalId: '70b3d57ed0000001',
  devEui: '70B3D57ED0000001',
  joinEui: '8877665544332211',
  appKey: '••••',
  nwkKey: null,
  deviceClass: null,
  lorawanVersion: '1.0.3',
  region: 'AU915',
  tags: [{ key: 'inventarius_asset_id', value: 'abc' }],
  target: { tenantId: 'T' },
  deviceProfile: { name: null, version: null, region: null },
  mismatches: [],
  fromDeviceProfile: [],
};

describe('previewRows', () => {
  it('perfil con su tipo, valores ausentes como «Sin definir» y tags como clave = valor', () => {
    const rows = previewRows(base, t);
    const by = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(by['profile']).toBe('CS · ChirpStack');
    expect(by['description']).toBe('Sin definir');
    expect(by['deviceClass']).toBe('Sin definir');
    expect(by['deviceProfile']).toBe('Sin definir');
    expect(by['tags']).toBe('inventarius_asset_id = abc');
    expect(by['target.tenantId']).toBe('T');
    expect(rows.find((r) => r.key === 'appKey')!.mono).toBe(true);
  });

  it('la NwkKey solo aparece si el servidor la envía (LoRaWAN 1.1)', () => {
    expect(previewRows(base, t).some((r) => r.key === 'nwkKey')).toBe(false);
    expect(previewRows({ ...base, nwkKey: '••••' }, t).some((r) => r.key === 'nwkKey')).toBe(true);
  });

  it('indica de dónde salen la versión y la región que se toman del device profile', () => {
    const rows = previewRows({ ...base, fromDeviceProfile: ['lorawanVersion', 'region'] }, tNamed);
    const by = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(by['lorawanVersion']).toBe('1.0.3, del device profile');
    expect(by['region']).toBe('AU915, del device profile');
    const some = previewRows({ ...base, fromDeviceProfile: ['region'] }, tNamed);
    expect(some.find((r) => r.key === 'lorawanVersion')!.value).toBe('1.0.3');
  });
});
