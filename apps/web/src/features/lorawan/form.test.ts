import { describe, expect, it } from 'vitest';
import type { LorawanDto } from '@inventarius/shared';
import { lorawanPatch, type LorawanForm } from './form';

const current: LorawanDto = {
  devEui: '0011223344556677',
  joinEui: '8877665544332211',
  hasAppKey: true,
  hasNwkKey: false,
  activation: 'OTAA',
  deviceClass: 'A',
  lorawanVersion: '1.0.3',
  region: 'AU915',
  modelDefaults: { deviceClass: 'A', lorawanVersion: '1.0.3', region: 'AU915' },
  missingForRegistration: [],
  registration: null,
};
const same = (): LorawanForm => ({
  devEui: current.devEui!,
  joinEui: current.joinEui!,
  appKey: '',
  nwkKey: '',
  removeAppKey: false,
  removeNwkKey: false,
  deviceClass: 'A',
  lorawanVersion: '1.0.3',
  region: 'AU915',
});
const KEY = '00112233445566778899aabbccddeeff';

describe('lorawanPatch', () => {
  it('sin cambios no envía nada', () => {
    expect(lorawanPatch(same(), current, false)).toEqual({ patch: {}, errors: {} });
  });

  it('envía solo lo que cambió y normaliza los hex', () => {
    const { patch } = lorawanPatch(
      { ...same(), devEui: '70:b3:d5:7e:d0:00:00:01', appKey: KEY, region: 'US915' },
      current,
      false,
    );
    expect(patch).toEqual({
      devEui: '70B3D57ED0000001',
      appKey: KEY.toUpperCase(),
      region: 'US915',
    });
  });

  it('una clave vacía no se toca; quitarla manda null', () => {
    expect(lorawanPatch(same(), current, false).patch).not.toHaveProperty('appKey');
    expect(lorawanPatch({ ...same(), removeAppKey: true }, current, false).patch).toEqual({
      appKey: null,
    });
  });

  it('vaciar un campo lo borra con null', () => {
    expect(lorawanPatch({ ...same(), joinEui: '', deviceClass: '' }, current, false).patch).toEqual(
      {
        joinEui: null,
        deviceClass: null,
      },
    );
  });

  it('informa los formatos inválidos con el largo esperado', () => {
    const { patch, errors } = lorawanPatch(
      { ...same(), devEui: '12', appKey: 'xyz' },
      current,
      false,
    );
    expect(errors).toEqual({ devEui: 16, appKey: 32 });
    expect(patch).toEqual({});
  });

  it('con la identidad bloqueada ignora DevEUI, JoinEUI y claves', () => {
    const { patch } = lorawanPatch(
      { ...same(), devEui: '1', appKey: KEY, region: 'US915' },
      current,
      true,
    );
    expect(patch).toEqual({ region: 'US915' });
  });
});
