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

// --- Datos LoRaWAN del activo (RF-21, sección 5.2) ---

/** Quita separadores (`:`, `-`, espacios) y pasa a mayúsculas: forma canónica de EUI y claves. */
export function normalizeHex(value: string): string {
  return value.replace(/[\s:-]/g, '').toUpperCase();
}

const hexOf = (length: number, label: string) =>
  z
    .string()
    .transform(normalizeHex)
    .refine((v) => new RegExp(`^[0-9A-F]{${length}}$`).test(v), {
      message: `${label} debe tener ${length} caracteres hexadecimales`,
    });

/** DevEUI / JoinEUI: 8 bytes (16 hex). */
export const devEuiSchema = hexOf(16, 'El DevEUI');
export const joinEuiSchema = hexOf(16, 'El JoinEUI');
/** AppKey / NwkKey: 16 bytes (32 hex). */
export const appKeySchema = hexOf(32, 'La AppKey');
export const nwkKeySchema = hexOf(32, 'La NwkKey');

export const LORAWAN_ACTIVATIONS = ['OTAA'] as const;

/** Estado del registro en el LNS (RF-61); la ausencia de registro es «no registrado». */
export const LNS_REGISTRATION_STATUSES = [
  'registering',
  'registered',
  'error',
  'partial',
  'conflict',
  'deregistering',
] as const;
export type LnsRegistrationStatus = (typeof LNS_REGISTRATION_STATUSES)[number];
export const lnsRegistrationStatusSchema = z.enum(LNS_REGISTRATION_STATUSES);

/** Valor del filtro «estado LNS»: incluye `none` (sin registro). */
export const lnsStatusFilterSchema = z.enum(['none', ...LNS_REGISTRATION_STATUSES]);

const nullable = <T extends z.ZodType>(schema: T) => schema.nullable();

/**
 * Cambio parcial de los datos LoRaWAN: un campo omitido no se toca; `null` lo borra. Las claves nunca vuelven
 * en las respuestas (solo si existen).
 */
export const updateLorawanSchema = z.object({
  devEui: nullable(devEuiSchema).optional(),
  joinEui: nullable(joinEuiSchema).optional(),
  appKey: nullable(appKeySchema).optional(),
  nwkKey: nullable(nwkKeySchema).optional(),
  deviceClass: nullable(lorawanClassSchema).optional(),
  lorawanVersion: nullable(lorawanVersionSchema).optional(),
  region: nullable(lorawanRegionSchema).optional(),
});
export type UpdateLorawanInput = z.infer<typeof updateLorawanSchema>;

/** Datos mínimos para evaluar si un activo se puede registrar en el LNS. */
export interface LorawanReadinessInput {
  devEui: string | null;
  joinEui: string | null;
  hasAppKey: boolean;
  hasNwkKey: boolean;
  lorawanVersion: string | null;
}

/** Campos que faltan para registrar (RF-60): DevEUI, JoinEUI, AppKey, y NwkKey en LoRaWAN 1.1. */
export function missingForRegistration(d: LorawanReadinessInput): string[] {
  const missing: string[] = [];
  if (!d.devEui) missing.push('devEui');
  if (!d.joinEui) missing.push('joinEui');
  if (!d.hasAppKey) missing.push('appKey');
  if (d.lorawanVersion === '1.1' && !d.hasNwkKey) missing.push('nwkKey');
  return missing;
}

/** Lo que el LNS tiene de un dispositivo, sin claves: solo si están o no (vincular, RF-64). */
export const remoteDeviceSchema = z.object({
  name: z.string(),
  joinEui: z.string().nullable(),
  deviceProfileId: z.string().nullable(),
  hasAppKey: z.boolean(),
  hasNwkKey: z.boolean(),
});
export type RemoteDeviceDto = z.infer<typeof remoteDeviceSchema>;

export const lnsRegistrationSchema = z.object({
  status: lnsRegistrationStatusSchema,
  profile: z.object({ id: z.uuid(), name: z.string(), kind: z.enum(['chirpstack', 'ttn']) }),
  externalId: z.string().nullable(),
  origin: z.enum(['created', 'linked']),
  lastError: z.string().nullable(),
  /** Componentes que quedaron huérfanos en el LNS cuando la compensación también falló (`partial`). */
  orphans: z.array(z.string()),
  attempts: z.number().int(),
  registeredAt: z.iso.datetime().nullable(),
  /** Lo que el LNS tenía de un dispositivo vinculado en el momento de vincularlo; `null` si no es vinculado. */
  remote: remoteDeviceSchema.extend({ readAt: z.iso.datetime() }).nullable(),
  updatedAt: z.iso.datetime(),
});
export type LnsRegistrationDto = z.infer<typeof lnsRegistrationSchema>;

export const lorawanSchema = z.object({
  devEui: z.string().nullable(),
  joinEui: z.string().nullable(),
  hasAppKey: z.boolean(),
  hasNwkKey: z.boolean(),
  activation: z.enum(LORAWAN_ACTIVATIONS),
  deviceClass: lorawanClassSchema.nullable(),
  lorawanVersion: lorawanVersionSchema.nullable(),
  region: lorawanRegionSchema.nullable(),
  /** Valores del modelo con los que se completan los campos vacíos al editar. */
  modelDefaults: z.object({
    deviceClass: lorawanClassSchema.nullable(),
    lorawanVersion: lorawanVersionSchema.nullable(),
    region: lorawanRegionSchema.nullable(),
  }),
  /** Campos que faltan para poder registrar en el LNS. */
  missingForRegistration: z.array(z.string()),
  registration: lnsRegistrationSchema.nullable(),
});
export type LorawanDto = z.infer<typeof lorawanSchema>;

export const revealKeysResultSchema = z.object({
  appKey: z.string().nullable(),
  nwkKey: z.string().nullable(),
});
export type RevealKeysResult = z.infer<typeof revealKeysResultSchema>;

export const registerInLnsSchema = z.object({ profileId: z.uuid() });
/** Datos del activo que se pueden reemplazar con los del LNS al vincular. */
export const linkAdoptFieldSchema = z.enum(['joinEui', 'appKey', 'nwkKey']);
export type LinkAdoptField = z.infer<typeof linkAdoptFieldSchema>;

/**
 * `adopt` (solo con `link`): qué campos adoptar del LNS. Sin él se adopta lo que la lectura previa propone por defecto
 * (`adopts`); con `[]` no se adopta nada.
 */
export const resolveConflictSchema = z.object({
  action: z.enum(['link', 'cancel']),
  adopt: z.array(linkAdoptFieldSchema).optional(),
});

// --- Importación CSV (RF-66) ---

/** Fila ya interpretada del CSV, tal como la valida el servidor. */
export const lorawanImportRowSchema = z.object({
  line: z.number().int(),
  serial: z.string(),
  assetId: z.uuid().nullable(),
  assetTag: z.string().nullable(),
  devEui: z.string().nullable(),
  errors: z.array(z.string()),
});
export const lorawanImportPreviewSchema = z.object({
  rows: z.array(lorawanImportRowSchema),
  total: z.number().int(),
  valid: z.number().int(),
  invalid: z.number().int(),
  /** Errores del archivo completo (cabecera, tamaño). */
  fileErrors: z.array(z.string()),
});
export type LorawanImportPreview = z.infer<typeof lorawanImportPreviewSchema>;

export const lorawanImportRequestSchema = z.object({
  /** Contenido del CSV como texto UTF-8. */
  csv: z.string().min(1).max(2_000_000),
});
export const lorawanImportResultSchema = z.object({ applied: z.number().int() });
