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
