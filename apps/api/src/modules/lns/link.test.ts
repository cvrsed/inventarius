import { describe, expect, it } from 'vitest';
import type { RemoteDeviceDetails } from './adapter.js';
import type { LinkAdoptField } from '@inventarius/shared';
import {
  adoptableFrom,
  adoptionFrom,
  compareRemoteDevice,
  defaultAdoption,
  type LocalDeviceView,
} from './link.js';

const KEY_A = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
const KEY_B = '0F1E2D3C4B5A69788796A5B4C3D2E1F0';

const local = (over: Partial<LocalDeviceView> = {}): LocalDeviceView => ({
  joinEui: '8877665544332211',
  name: 'INV-000001 Sensor',
  deviceProfileId: 'dp-1',
  appKey: KEY_A,
  nwkKey: null,
  usesNwkKey: false,
  ...over,
});
const remote = (over: Partial<RemoteDeviceDetails> = {}): RemoteDeviceDetails => ({
  externalId: '70b3d57ed0000001',
  name: 'INV-000001 Sensor',
  joinEui: '8877665544332211',
  deviceProfileId: 'dp-1',
  inventariusAssetId: null,
  appKey: KEY_A,
  nwkKey: null,
  ...over,
});

describe('compareRemoteDevice (vincular, RF-64)', () => {
  it('idéntico: sin diferencias', () => {
    expect(compareRemoteDevice(local(), remote())).toEqual([]);
    // El JoinEUI y las claves no distinguen mayúsculas.
    expect(
      compareRemoteDevice(
        local(),
        remote({ joinEui: '8877665544332211'.toLowerCase(), appKey: KEY_A.toLowerCase() }),
      ),
    ).toEqual([]);
  });

  it('JoinEUI, device profile y nombre distintos', () => {
    expect(
      compareRemoteDevice(
        local(),
        remote({ joinEui: '0000000000000000', deviceProfileId: 'dp-otro', name: 'Otro nombre' }),
      ),
    ).toEqual([
      { field: 'joinEui', local: '8877665544332211', remote: '0000000000000000' },
      { field: 'deviceProfile', local: 'dp-1', remote: 'dp-otro' },
      { field: 'name', local: 'INV-000001 Sensor', remote: 'Otro nombre' },
    ]);
  });

  it('claves: presente/ausente y «distinta», sin mostrar nunca el valor', () => {
    expect(compareRemoteDevice(local(), remote({ appKey: null }))).toEqual([
      { field: 'appKey', local: 'present', remote: 'absent' },
    ]);
    expect(compareRemoteDevice(local({ appKey: null }), remote())).toEqual([
      { field: 'appKey', local: 'absent', remote: 'present' },
    ]);
    const differs = compareRemoteDevice(local(), remote({ appKey: KEY_B }));
    expect(differs).toEqual([{ field: 'appKey', local: 'present', remote: 'differs' }]);
    expect(JSON.stringify(differs)).not.toContain(KEY_A);
    expect(JSON.stringify(differs)).not.toContain(KEY_B);
  });

  it('la NwkKey solo cuenta en LoRaWAN 1.1', () => {
    expect(compareRemoteDevice(local(), remote({ nwkKey: KEY_B }))).toEqual([]);
    expect(
      compareRemoteDevice(local({ usesNwkKey: true, nwkKey: KEY_B }), remote({ nwkKey: null })),
    ).toEqual([{ field: 'nwkKey', local: 'present', remote: 'absent' }]);
  });

  it('sin device profile esperado (TTN) no se compara', () => {
    expect(
      compareRemoteDevice(local({ deviceProfileId: null }), remote({ deviceProfileId: null })),
    ).toEqual([]);
  });
});

const adopted = (l: LocalDeviceView, r: RemoteDeviceDetails, sel?: LinkAdoptField[]) =>
  adoptionFrom(l, r, sel).values;

describe('adoptionFrom: qué se copia al activo al adoptar los datos del LNS', () => {
  it('copia JoinEUI y claves que el LNS tiene y difieren', () => {
    expect(adopted(local(), remote({ joinEui: 'AABBCCDDEEFF0011', appKey: KEY_B }))).toEqual({
      joinEui: 'AABBCCDDEEFF0011',
      appKey: KEY_B,
    });
  });

  it('lo que el LNS no tiene no se borra del activo', () => {
    expect(adopted(local(), remote({ joinEui: null, appKey: null }))).toEqual({});
  });

  it('nada que copiar si coincide', () => {
    expect(adopted(local(), remote())).toEqual({});
  });

  it('la NwkKey solo se adopta en 1.1', () => {
    expect(adopted(local(), remote({ nwkKey: KEY_B }))).toEqual({});
    expect(adopted(local({ usesNwkKey: true }), remote({ nwkKey: KEY_B }))).toEqual({
      nwkKey: KEY_B,
    });
  });

  it('un JoinEUI en ceros (sin definir) se ofrece pero no se adopta por defecto', () => {
    const r = remote({ joinEui: '0000000000000000', appKey: KEY_B });
    expect(adoptableFrom(local(), r)).toEqual({ joinEui: '0000000000000000', appKey: KEY_B });
    expect(defaultAdoption(adoptableFrom(local(), r))).toEqual(['appKey']);
    expect(adopted(local(), r)).toEqual({ appKey: KEY_B });
  });

  it('con selección explícita se adopta solo lo elegido, y lo no adoptable se informa', () => {
    const r = remote({ joinEui: '0000000000000000', appKey: KEY_B });
    expect(adopted(local(), r, ['joinEui'])).toEqual({ joinEui: '0000000000000000' });
    expect(adopted(local(), r, [])).toEqual({});
    expect(adoptionFrom(local(), r, ['nwkKey']).invalid).toEqual(['nwkKey']);
  });
});
