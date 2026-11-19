import { describe, expect, it } from 'vitest';
import { compareWithDeviceProfile, type DeviceProfileInfo } from './device-profile.js';

const info = (over: Partial<DeviceProfileInfo> = {}): DeviceProfileInfo => ({
  id: 'dp',
  name: 'Perfil AU915',
  version: '1.0.3',
  region: 'AU915',
  classes: ['A'],
  versionLabel: '1.0.3',
  regionLabel: 'AU915',
  ...over,
});
const asset = { lorawanVersion: '1.0.3', deviceClass: 'A', region: 'AU915' } as const;

describe('compareWithDeviceProfile', () => {
  it('sin diferencias, nada que reportar', () => {
    expect(compareWithDeviceProfile(asset, info())).toEqual([]);
  });

  it('versión, región y clase distintas se reportan una por una', () => {
    expect(
      compareWithDeviceProfile(
        { lorawanVersion: '1.1', deviceClass: 'C', region: 'EU868' },
        info(),
      ),
    ).toEqual([
      { field: 'lorawanVersion', asset: '1.1', lns: '1.0.3' },
      { field: 'region', asset: 'EU868', lns: 'AU915' },
      { field: 'deviceClass', asset: 'C', lns: 'A' },
    ]);
  });

  it('una clase que el perfil admite no es diferencia (A y C)', () => {
    expect(
      compareWithDeviceProfile({ ...asset, deviceClass: 'C' }, info({ classes: ['A', 'C'] })),
    ).toEqual([]);
  });

  it('lo que el LNS no fija o el activo no tiene no se compara', () => {
    expect(
      compareWithDeviceProfile(
        { lorawanVersion: '1.1', deviceClass: 'C', region: 'EU868' },
        info({ version: null, region: null, classes: null }),
      ),
    ).toEqual([]);
    expect(
      compareWithDeviceProfile({ lorawanVersion: null, deviceClass: null, region: null }, info()),
    ).toEqual([]);
  });
});
