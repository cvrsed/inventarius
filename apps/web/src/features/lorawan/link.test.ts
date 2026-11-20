import { describe, expect, it } from 'vitest';
import { messages } from '@/app/i18n/es-CL';
import { describeDifference, deviceProfileText } from './link';

const lookup = (key: string): string =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], messages) as string;
const t = (key: string, named: Record<string, unknown> = {}) =>
  lookup(key).replace(/\{(\w+)\}/g, (_m, k: string) => String(named[k]));

describe('describeDifference', () => {
  it('valores: «el activo tiene X y el LNS Y»; ausente como «Sin definir»', () => {
    expect(describeDifference({ field: 'joinEui', local: 'AA', remote: 'BB' }, t)).toEqual({
      field: 'joinEui',
      label: 'JoinEUI',
      text: 'el activo tiene AA y el LNS BB',
    });
    expect(
      describeDifference({ field: 'deviceProfile', local: 'dp-1', remote: null }, t).text,
    ).toBe('el activo tiene dp-1 y el LNS Sin definir');
  });

  it('claves: nunca valores; «no está en el LNS», «está» o «es distinta»', () => {
    expect(describeDifference({ field: 'appKey', local: 'present', remote: 'absent' }, t)).toEqual({
      field: 'appKey',
      label: 'AppKey',
      text: 'no está en el LNS (en el activo: cargada)',
    });
    expect(
      describeDifference({ field: 'appKey', local: 'absent', remote: 'present' }, t).text,
    ).toBe('está en el LNS (en el activo: sin cargar)');
    expect(
      describeDifference({ field: 'nwkKey', local: 'present', remote: 'differs' }, t).text,
    ).toBe('es distinta en el LNS y en el activo');
  });

  it('el device profile se muestra con nombre, versión y región, no como UUID', () => {
    const labels = {
      local: { name: 'Perfil AU915', version: 'LoRaWAN 1.0.3', region: 'AU915' },
      remote: { name: 'Perfil EU868', version: 'LoRaWAN 1.0.2', region: 'EU868' },
    };
    expect(
      describeDifference({ field: 'deviceProfile', local: 'dp-1', remote: 'dp-2' }, t, labels).text,
    ).toBe(
      'el activo tiene Perfil AU915 · LoRaWAN 1.0.3 · AU915 y el LNS Perfil EU868 · LoRaWAN 1.0.2 · EU868',
    );
  });

  it('deviceProfileText: etiqueta si la hay, el id si no se pudo leer, «Sin definir» si no hay nada', () => {
    const label = { name: 'Perfil', version: null, region: 'AU915' };
    expect(deviceProfileText(label, 'dp-1', 'Sin definir')).toBe('Perfil · AU915');
    expect(deviceProfileText(null, 'dp-1', 'Sin definir')).toBe('dp-1');
    expect(deviceProfileText(null, null, 'Sin definir')).toBe('Sin definir');
    expect(deviceProfileText({ name: null, version: null, region: null }, 'dp-1', 'x')).toBe(
      'dp-1',
    );
  });
});
