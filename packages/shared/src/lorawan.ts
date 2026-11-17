import { z } from 'zod';

/**
 * Listas cerradas de LoRaWAN: fuente única para la API (validación) y la web (selectores).
 * Los valores son los identificadores de la especificación; las etiquetas están en español.
 */
export interface LorawanOption<V extends string> {
  value: V;
  label: string;
}

/** Plan de frecuencias según «LoRaWAN Regional Parameters». */
export const LORAWAN_REGIONS = [
  'EU868',
  'US915',
  'AU915',
  'AS923-1',
  'AS923-2',
  'AS923-3',
  'AS923-4',
  'KR920',
  'IN865',
  'RU864',
  'CN470',
  'CN779',
  'EU433',
] as const;
export type LorawanRegion = (typeof LORAWAN_REGIONS)[number];
export const lorawanRegionSchema = z.enum(LORAWAN_REGIONS);

const REGION_LABELS: Record<LorawanRegion, string> = {
  EU868: 'EU868 — Europa (863–870 MHz)',
  US915: 'US915 — Norteamérica (902–928 MHz)',
  AU915: 'AU915 — Australia y Latinoamérica (915–928 MHz)',
  'AS923-1': 'AS923-1 — Asia-Pacífico, grupo 1 (923 MHz)',
  'AS923-2': 'AS923-2 — Asia-Pacífico, grupo 2 (923 MHz)',
  'AS923-3': 'AS923-3 — Asia-Pacífico, grupo 3 (923 MHz)',
  'AS923-4': 'AS923-4 — Asia-Pacífico, grupo 4 (923 MHz)',
  KR920: 'KR920 — Corea del Sur (920–923 MHz)',
  IN865: 'IN865 — India (865–867 MHz)',
  RU864: 'RU864 — Rusia (864–870 MHz)',
  CN470: 'CN470 — China (470–510 MHz)',
  CN779: 'CN779 — China, en desuso (779–787 MHz)',
  EU433: 'EU433 — Europa (433 MHz)',
};

/** Clase del dispositivo (A, B o C). */
export const LORAWAN_CLASSES = ['A', 'B', 'C'] as const;
export type LorawanClass = (typeof LORAWAN_CLASSES)[number];
export const lorawanClassSchema = z.enum(LORAWAN_CLASSES);

const CLASS_LABELS: Record<LorawanClass, string> = {
  A: 'Clase A — recibe solo tras enviar (menor consumo)',
  B: 'Clase B — ventanas de recepción programadas',
  C: 'Clase C — recepción continua (mayor consumo)',
};

/** Versión de la especificación LoRaWAN (MAC). */
export const LORAWAN_VERSIONS = ['1.0', '1.0.1', '1.0.2', '1.0.3', '1.0.4', '1.1'] as const;
export type LorawanVersion = (typeof LORAWAN_VERSIONS)[number];
export const lorawanVersionSchema = z.enum(LORAWAN_VERSIONS);

/** Versión del documento de parámetros regionales (RP001 para 1.1, RP002 para 1.0.x). */
export const LORAWAN_REGIONAL_PARAMETERS = [
  'RP002-1.0.0',
  'RP002-1.0.1',
  'RP002-1.0.2',
  'RP002-1.0.3',
  'RP002-1.0.4',
  'RP001-1.0.2',
  'RP001-1.0.2-B',
  'RP001-1.0.3-A',
  'RP001-1.1-A',
  'RP001-1.1-B',
] as const;
export type LorawanRegionalParameters = (typeof LORAWAN_REGIONAL_PARAMETERS)[number];
export const lorawanRegionalParametersSchema = z.enum(LORAWAN_REGIONAL_PARAMETERS);

const REGIONAL_PARAMETERS_LABELS: Record<LorawanRegionalParameters, string> = {
  'RP002-1.0.0': 'RP002 1.0.0',
  'RP002-1.0.1': 'RP002 1.0.1',
  'RP002-1.0.2': 'RP002 1.0.2',
  'RP002-1.0.3': 'RP002 1.0.3',
  'RP002-1.0.4': 'RP002 1.0.4',
  'RP001-1.0.2': 'RP001 1.0.2',
  'RP001-1.0.2-B': 'RP001 1.0.2, revisión B',
  'RP001-1.0.3-A': 'RP001 1.0.3, revisión A',
  'RP001-1.1-A': 'RP001 1.1, revisión A',
  'RP001-1.1-B': 'RP001 1.1, revisión B',
};

const options = <V extends string>(
  values: readonly V[],
  labels: Record<V, string>,
): readonly LorawanOption<V>[] => values.map((value) => ({ value, label: labels[value] }));

export const LORAWAN_REGION_OPTIONS = options(LORAWAN_REGIONS, REGION_LABELS);
export const LORAWAN_CLASS_OPTIONS = options(LORAWAN_CLASSES, CLASS_LABELS);
export const LORAWAN_VERSION_OPTIONS = options(
  LORAWAN_VERSIONS,
  Object.fromEntries(LORAWAN_VERSIONS.map((v) => [v, `LoRaWAN ${v}`])) as Record<
    LorawanVersion,
    string
  >,
);
export const LORAWAN_REGIONAL_PARAMETERS_OPTIONS = options(
  LORAWAN_REGIONAL_PARAMETERS,
  REGIONAL_PARAMETERS_LABELS,
);
