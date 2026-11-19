import { describe, expect, it } from 'vitest';
import {
  LORAWAN_CLASS_OPTIONS,
  LORAWAN_REGIONAL_PARAMETERS,
  LORAWAN_REGIONAL_PARAMETERS_OPTIONS,
  LORAWAN_REGION_OPTIONS,
  LORAWAN_REGIONS,
  LORAWAN_VERSION_OPTIONS,
  LORAWAN_VERSIONS,
  lorawanClassSchema,
  lorawanRegionSchema,
  lorawanRegionalParametersSchema,
  lorawanVersionSchema,
} from './lorawan.js';

describe('listas LoRaWAN (fuente única)', () => {
  it('cubre todas las bandas de los Regional Parameters', () => {
    expect([...LORAWAN_REGIONS].sort()).toEqual(
      [
        'AS923-1',
        'AS923-2',
        'AS923-3',
        'AS923-4',
        'AU915',
        'CN470',
        'CN779',
        'EU433',
        'EU868',
        'IN865',
        'KR920',
        'RU864',
        'US915',
      ].sort(),
    );
  });

  it('cada opción trae valor y etiqueta en español, sin repetir valores', () => {
    for (const [values, opts] of [
      [LORAWAN_REGIONS, LORAWAN_REGION_OPTIONS],
      [LORAWAN_VERSIONS, LORAWAN_VERSION_OPTIONS],
      [LORAWAN_REGIONAL_PARAMETERS, LORAWAN_REGIONAL_PARAMETERS_OPTIONS],
      [['A', 'B', 'C'], LORAWAN_CLASS_OPTIONS],
    ] as const) {
      expect(opts.map((o) => o.value)).toEqual([...values]);
      expect(new Set(opts.map((o) => o.value)).size).toBe(opts.length);
      for (const o of opts) expect(o.label.length).toBeGreaterThan(0);
    }
    expect(LORAWAN_CLASS_OPTIONS[0]!.label).toMatch(/^Clase A/);
    expect(LORAWAN_REGION_OPTIONS.find((o) => o.value === 'AU915')!.label).toContain('915');
  });

  it('los esquemas son cerrados', () => {
    expect(lorawanRegionSchema.safeParse('AU915').success).toBe(true);
    expect(lorawanRegionSchema.safeParse('AU916').success).toBe(false);
    expect(lorawanVersionSchema.safeParse('1.0.3').success).toBe(true);
    expect(lorawanVersionSchema.safeParse('2.0').success).toBe(false);
    expect(lorawanRegionalParametersSchema.safeParse('RP002-1.0.3').success).toBe(true);
    expect(lorawanRegionalParametersSchema.safeParse('RP9').success).toBe(false);
    expect(lorawanClassSchema.safeParse('D').success).toBe(false);
  });
});

import {
  appKeySchema,
  devEuiSchema,
  missingForRegistration,
  normalizeHex,
  updateLorawanSchema,
} from './lorawan.js';
import { createLnsProfileSchema } from './lns.js';

describe('formatos EUI y claves', () => {
  it('normaliza a mayúsculas sin separadores', () => {
    expect(normalizeHex('00:11-22 aa')).toBe('001122AA');
    expect(devEuiSchema.parse('00:11:22:33:44:55:66:77')).toBe('0011223344556677');
    expect(devEuiSchema.parse('aabbccddeeff0011')).toBe('AABBCCDDEEFF0011');
  });
  it('rechaza largo o caracteres inválidos', () => {
    expect(devEuiSchema.safeParse('0011').success).toBe(false);
    expect(devEuiSchema.safeParse('GGGGGGGGGGGGGGGG').success).toBe(false);
    expect(appKeySchema.safeParse('00'.repeat(16)).success).toBe(true);
    expect(appKeySchema.safeParse('00'.repeat(15)).success).toBe(false);
  });
  it('acepta null para borrar y omitido para no tocar', () => {
    expect(updateLorawanSchema.parse({ appKey: null })).toEqual({ appKey: null });
    expect(updateLorawanSchema.parse({})).toEqual({});
  });
});

describe('datos exigidos para registrar (RF-60)', () => {
  const ok = {
    devEui: 'A',
    joinEui: 'B',
    hasAppKey: true,
    hasNwkKey: false,
    lorawanVersion: '1.0.3',
  };
  it('1.0.x pide DevEUI, JoinEUI y AppKey', () => {
    expect(missingForRegistration(ok)).toEqual([]);
    expect(
      missingForRegistration({ ...ok, devEui: null, joinEui: null, hasAppKey: false }),
    ).toEqual(['devEui', 'joinEui', 'appKey']);
  });
  it('1.1 pide además NwkKey', () => {
    expect(missingForRegistration({ ...ok, lorawanVersion: '1.1' })).toEqual(['nwkKey']);
  });
});

describe('perfil LNS', () => {
  const chirp = {
    kind: 'chirpstack',
    name: 'ChirpStack de prueba',
    endpoint: 'chirpstack.test:8080',
    credential: 'api-key-de-prueba',
    target: {
      tenantId: '0190a1b2-0000-7000-8000-000000000001',
      applicationId: '0190a1b2-0000-7000-8000-000000000002',
    },
    deviceDefaults: { deviceProfileId: '0190a1b2-0000-7000-8000-000000000003' },
  };
  it('valida endpoint host:puerto y ids de ChirpStack', () => {
    expect(createLnsProfileSchema.safeParse(chirp).success).toBe(true);
    expect(createLnsProfileSchema.safeParse({ ...chirp, endpoint: 'sin-puerto' }).success).toBe(
      false,
    );
    expect(
      createLnsProfileSchema.safeParse({ ...chirp, target: { ...chirp.target, tenantId: 'x' } })
        .success,
    ).toBe(false);
  });
  it('TTN exige URL y direcciones de servidores', () => {
    const ttn = {
      kind: 'ttn',
      name: 'TTN de prueba',
      endpoint: 'https://eu1.example.test',
      credential: 'NNSXS.PRUEBA',
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
    expect(createLnsProfileSchema.safeParse(ttn).success).toBe(true);
    expect(createLnsProfileSchema.safeParse({ ...ttn, endpoint: 'nope' }).success).toBe(false);
  });
});
