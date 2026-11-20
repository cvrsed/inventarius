import { z } from 'zod';
import { remoteDeviceSchema } from './lorawan.js';

/** Proveedores de LNS soportados (sección 5.1). */
export const LNS_KINDS = ['chirpstack', 'ttn'] as const;
export type LnsKind = (typeof LNS_KINDS)[number];
export const lnsKindSchema = z.enum(LNS_KINDS);

const text = (max: number) => z.string().trim().min(1).max(max);
const description = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === '' ? null : v))
  .nullable();

const chirpstackBase = {
  kind: z.literal('chirpstack'),
  /** `host:puerto` gRPC (8080 por defecto). */
  endpoint: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9._-]+:\d{1,5}$/, 'Usa el formato host:puerto'),
  tls: z.boolean().default(false),
  target: z.object({ tenantId: z.uuid(), applicationId: z.uuid() }),
  deviceDefaults: z.object({ deviceProfileId: z.uuid() }),
};

const ttnBase = {
  kind: z.literal('ttn'),
  /** URL del cluster o de la instancia propia. */
  endpoint: z.url({ protocol: /^https?$/ }).max(255),
  target: z.object({
    applicationId: z
      .string()
      .trim()
      .regex(/^[a-z0-9](?:[-]?[a-z0-9]){1,35}$/, 'Id de aplicación TTN inválido'),
  }),
  deviceDefaults: z.object({
    frequencyPlanId: text(64),
    macVersion: text(16),
    phyVersion: text(32),
    joinServerAddress: text(255),
    networkServerAddress: text(255),
    applicationServerAddress: text(255),
  }),
};

const common = {
  name: text(80),
  description: description.default(null),
  active: z.boolean().default(true),
};
const credential = z.string().trim().min(8).max(2000);

export const createLnsProfileSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, ...chirpstackBase, credential }),
  z.object({ ...common, ...ttnBase, credential }),
]);
export type CreateLnsProfileInput = z.infer<typeof createLnsProfileSchema>;

/** Edición parcial: el proveedor no cambia; la credencial solo se reemplaza, nunca se lee (RF-50). */
export const updateLnsProfileSchema = z.object({
  name: common.name.optional(),
  description: description.optional(),
  active: z.boolean().optional(),
  endpoint: z.string().trim().min(1).max(255).optional(),
  tls: z.boolean().optional(),
  credential: credential.optional(),
  target: z.record(z.string(), z.string()).optional(),
  deviceDefaults: z.record(z.string(), z.string()).optional(),
});
export type UpdateLnsProfileInput = z.infer<typeof updateLnsProfileSchema>;

export const lnsProfileSchema = z.object({
  id: z.uuid(),
  kind: lnsKindSchema,
  name: z.string(),
  description: z.string().nullable(),
  endpoint: z.string(),
  tls: z.boolean(),
  /** `•••• abcd`: los últimos 4 caracteres de la credencial. */
  credentialHint: z.string(),
  target: z.record(z.string(), z.string()),
  deviceDefaults: z.record(z.string(), z.string()),
  active: z.boolean(),
  registeredDevices: z.number().int(),
  updatedAt: z.iso.datetime(),
});
export type LnsProfileDto = z.infer<typeof lnsProfileSchema>;

export const connectionCheckSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int(),
  /** Un mensaje legible por cada comprobación (credencial, tenant, aplicación…). */
  checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string().nullable() })),
});
export type ConnectionCheckDto = z.infer<typeof connectionCheckSchema>;

/** Una diferencia entre el activo y el device profile del LNS (RF-60). */
export const profileMismatchSchema = z.object({
  field: z.enum(['lorawanVersion', 'deviceClass', 'region']),
  /** Lo que tiene el activo. */
  asset: z.string(),
  /** Lo que tiene el LNS. */
  lns: z.string(),
});
export type ProfileMismatchDto = z.infer<typeof profileMismatchSchema>;

/**
 * Confirmación previa al registro: exactamente lo que se enviará al LNS (RF-60). Las claves van solo enmascaradas.
 * Lo arma la misma función que arma lo que recibe el adaptador, así que no puede diverger de lo enviado.
 */
export const registrationPreviewSchema = z.object({
  profile: z.object({ id: z.uuid(), name: z.string(), kind: lnsKindSchema }),
  deviceName: z.string(),
  description: z.string(),
  externalId: z.string(),
  devEui: z.string(),
  joinEui: z.string(),
  /** `••••`: la clave nunca sale; solo se confirma que se enviará. */
  appKey: z.string(),
  /** Solo en LoRaWAN 1.1. */
  nwkKey: z.string().nullable(),
  deviceClass: z.string().nullable(),
  lorawanVersion: z.string().nullable(),
  region: z.string().nullable(),
  /** Etiquetas (ChirpStack) o atributos (TTN) con que se marca el dispositivo. */
  tags: z.array(z.object({ key: z.string(), value: z.string() })),
  /** Destino en el LNS (tenant y aplicación, o aplicación). */
  target: z.record(z.string(), z.string()),
  /** Device profile del LNS al que irá el dispositivo, tal como lo tiene el LNS. */
  deviceProfile: z.object({
    name: z.string().nullable(),
    version: z.string().nullable(),
    region: z.string().nullable(),
  }),
  /** Si no está vacío, el registro se rechaza hasta que activo y device profile coincidan. */
  mismatches: z.array(profileMismatchSchema),
  /** Campos que el activo no tiene y se tomarán del device profile al registrar (se guardan en el activo). */
  fromDeviceProfile: z.array(z.enum(['lorawanVersion', 'region'])),
});
export type RegistrationPreviewDto = z.infer<typeof registrationPreviewSchema>;

/** Una diferencia entre el activo y el dispositivo que ya existe en el LNS (vincular, RF-64). */
export const linkDifferenceSchema = z.object({
  field: z.enum(['joinEui', 'deviceProfile', 'name', 'appKey', 'nwkKey']),
  /** Valor local; en las claves, `present` o `absent` (nunca el valor). */
  local: z.string().nullable(),
  /** Valor remoto; en las claves, `present`, `absent` o `differs` (están las dos pero no coinciden). */
  remote: z.string().nullable(),
});
export type LinkDifferenceDto = z.infer<typeof linkDifferenceSchema>;

/** Lectura previa a vincular: qué hay en el LNS y en qué difiere del activo. Vincular no modifica el remoto. */
export const linkPreviewSchema = z.object({
  profile: z.object({ id: z.uuid(), name: z.string(), kind: lnsKindSchema }),
  externalId: z.string(),
  remote: remoteDeviceSchema,
  differences: z.array(linkDifferenceSchema),
  /** Datos del activo que se reemplazan al adoptar los del LNS (`joinEui`, `appKey`, `nwkKey`). */
  adopts: z.array(z.enum(['joinEui', 'appKey', 'nwkKey'])),
});
export type LinkPreviewDto = z.infer<typeof linkPreviewSchema>;
