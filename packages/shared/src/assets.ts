import { z } from 'zod';
import { categoryExtensionSchema, refSchema, statusKindSchema } from './catalog.js';
import { currencySchema } from './currency.js';
import { pageQuerySchema } from './identity.js';
import {
  lnsRegistrationStatusSchema,
  lnsStatusFilterSchema,
  updateLorawanSchema,
} from './lorawan.js';

const dateOnly = z.iso.date();
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v));

/** Etiqueta de activo: letras, números y `._-`. Se guarda tal cual; la unicidad no distingue mayúsculas. */
export const assetTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'Usa letras, números, punto, guion o guion bajo');

export const ASSET_SORTS = [
  'assetTag',
  'name',
  'status',
  'model',
  'location',
  'purchaseDate',
  'createdAt',
] as const;
export type AssetSort = (typeof ASSET_SORTS)[number];

/** `-campo` ordena de forma descendente. */
export const assetSortSchema = z
  .string()
  .transform((v) => (v.startsWith('-') ? { key: v.slice(1), desc: true } : { key: v, desc: false }))
  .pipe(
    z.object({
      key: z.enum(ASSET_SORTS),
      desc: z.boolean(),
    }),
  );
export type AssetSortSpec = z.infer<typeof assetSortSchema>;

/** Filtros del listado y de la exportación (RF-22, RF-26). Los filtros viajan también en la URL del front. */
export const assetFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.uuid().optional(),
  modelId: z.uuid().optional(),
  statusId: z.uuid().optional(),
  /** Ubicación actual (donde está hoy): la elegida y todas sus sububicaciones. Los asignados a una persona no la tienen. */
  locationId: z.uuid().optional(),
  assignedUserId: z.uuid().optional(),
  /** Bodega base del activo (stock por bodega del Inicio, RF-28): la elegida y todas sus sububicaciones. */
  baseLocationId: z.uuid().optional(),
  /** Tipo del estado (no su nombre): renombrar un estado no rompe los enlaces del Inicio. */
  statusKind: statusKindSchema.optional(),
  /** `yes` = asignados a una persona o ubicación; `no` = libres. */
  assigned: z.enum(['yes', 'no']).optional(),
  /** Estado del registro en el LNS (`none` = sin registro, RF-22). */
  lnsStatus: lnsStatusFilterSchema.optional(),
  /** `true` = con la devolución esperada vencida. */
  overdue: z.enum(['true']).optional(),
  /** `exclude` (por defecto), `include` o `only` (papelera, RF-25). */
  deleted: z.enum(['exclude', 'include', 'only']).default('exclude'),
});
export type AssetFilters = z.infer<typeof assetFiltersSchema>;

const sortParam = z
  .string()
  .max(40)
  .refine((v) => assetSortSchema.safeParse(v).success, 'Orden no válido')
  .optional();

export const assetListQuerySchema = pageQuerySchema.extend({
  ...assetFiltersSchema.shape,
  sort: sortParam,
});
export const assetExportQuerySchema = assetFiltersSchema.extend({ sort: sortParam });
export type AssetListQuery = z.infer<typeof assetListQuerySchema>;

export const assetListItemSchema = z.object({
  id: z.uuid(),
  assetTag: z.string(),
  name: z.string(),
  serial: z.string().nullable(),
  model: refSchema,
  category: refSchema.extend({ extension: categoryExtensionSchema }),
  status: refSchema.extend({ kind: statusKindSchema }),
  /** Dónde está ahora; vacío si lo tiene una persona (ver `assignedUser`). */
  location: refSchema.extend({ path: z.string() }).nullable(),
  /** Bodega donde vive el activo cuando no está asignado. */
  baseLocation: refSchema.nullable(),
  assignedUser: refSchema.nullable(),
  assignedLocation: refSchema.nullable(),
  deleted: z.boolean(),
  /** DevEUI y estado en el LNS; vacíos si el activo no tiene datos LoRaWAN. */
  devEui: z.string().nullable(),
  lnsStatus: lnsRegistrationStatusSchema.nullable(),
  updatedAt: z.iso.datetime(),
});
export type AssetListItemDto = z.infer<typeof assetListItemSchema>;

export const assetSchema = assetListItemSchema.extend({
  manufacturer: refSchema,
  purchaseDate: dateOnly.nullable(),
  purchaseCost: z.number().nullable(),
  purchaseCurrency: currencySchema,
  supplier: z.string().nullable(),
  warrantyMonths: z.number().int().nullable(),
  notes: z.string().nullable(),
  /** Fin de la garantía (compra + meses), si hay ambos datos. */
  warrantyEndsOn: dateOnly.nullable(),
  assignment: z
    .object({
      since: z.iso.datetime(),
      expectedReturnOn: dateOnly.nullable(),
      note: z.string().nullable(),
    })
    .nullable(),
  deletedAt: z.iso.datetime().nullable(),
  deleteReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AssetDto = z.infer<typeof assetSchema>;

const assetEditable = {
  name: z.string().trim().min(1).max(200),
  serial: text(120).nullable(),
  modelId: z.uuid(),
  statusId: z.uuid(),
  baseLocationId: z.uuid().nullable(),
  purchaseDate: dateOnly.nullable(),
  purchaseCost: z.number().min(0).max(9_999_999_999.99).multipleOf(0.01).nullable(),
  purchaseCurrency: currencySchema,
  supplier: text(120).nullable(),
  warrantyMonths: z.number().int().min(0).max(600).nullable(),
  notes: text(2000).nullable(),
};

export const createAssetSchema = z.object({
  /** Si falta, se genera con el prefijo configurable (D6). */
  assetTag: assetTagSchema.optional(),
  name: assetEditable.name,
  modelId: assetEditable.modelId,
  statusId: assetEditable.statusId,
  serial: assetEditable.serial.default(null),
  baseLocationId: assetEditable.baseLocationId.default(null),
  purchaseDate: assetEditable.purchaseDate.default(null),
  purchaseCost: assetEditable.purchaseCost.default(null),
  /** Si falta, se usa la moneda por defecto de la instalación. */
  purchaseCurrency: assetEditable.purchaseCurrency.optional(),
  supplier: assetEditable.supplier.default(null),
  warrantyMonths: assetEditable.warrantyMonths.default(null),
  notes: assetEditable.notes.default(null),
  /** Datos LoRaWAN opcionales al crear (RF-21); solo para modelos de categoría LoRaWAN. */
  lorawan: updateLorawanSchema.optional(),
});
export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const updateAssetSchema = z
  .object({
    ...assetEditable,
    assetTag: assetTagSchema,
    /** El estado solo se fija al crear; después cambia con «Cambiar estado» (`changeStatusRequestSchema`). */
    statusId: z.never({ error: 'Usa «Cambiar estado» para modificar el estado' }),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;

/** Cambio de estado de un activo no asignado: queda en el historial con su nota. */
export const changeStatusRequestSchema = z.object({
  statusId: z.uuid(),
  note: text(500).optional(),
});
export type ChangeStatusRequest = z.infer<typeof changeStatusRequestSchema>;

/** RF-27: alta en lote. Con `serials` la cantidad debe coincidir con la lista. */
export const MAX_BATCH_SIZE = 500;
export const batchAssetsRequestSchema = z
  .object({
    modelId: z.uuid(),
    quantity: z.number().int().min(1).max(MAX_BATCH_SIZE),
    baseLocationId: z.uuid(),
    statusId: z.uuid(),
    /** Nombre de cada activo; si falta se usa el nombre del modelo. */
    name: assetEditable.name.optional(),
    serials: z.array(z.string().trim().min(1).max(120)).max(MAX_BATCH_SIZE).optional(),
  })
  .refine((v) => v.serials === undefined || v.serials.length === v.quantity, {
    message: 'La cantidad debe coincidir con las series entregadas',
    path: ['serials'],
  });
export type BatchAssetsRequest = z.infer<typeof batchAssetsRequestSchema>;

export const batchAssetsResultSchema = z.object({
  batchId: z.uuid(),
  count: z.number().int(),
  assets: z.array(z.object({ id: z.uuid(), assetTag: z.string(), serial: z.string().nullable() })),
});
export type BatchAssetsResult = z.infer<typeof batchAssetsResultSchema>;

/** RF-23: a un usuario o a una ubicación (exactamente uno). */
export const checkoutRequestSchema = z
  .object({
    userId: z.uuid().optional(),
    locationId: z.uuid().optional(),
    expectedReturnOn: dateOnly.optional(),
    note: text(500).optional(),
  })
  .refine((v) => (v.userId === undefined) !== (v.locationId === undefined), {
    message: 'Indica un usuario o una ubicación, no ambos',
    path: ['userId'],
  });
export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const checkinRequestSchema = z.object({
  /** Estado en que queda el activo al volver. */
  statusId: z.uuid(),
  /** Bodega a la que vuelve (por defecto, la ubicación base del activo). */
  locationId: z.uuid(),
  note: text(500).optional(),
});
export type CheckinRequest = z.infer<typeof checkinRequestSchema>;

export const deleteAssetRequestSchema = z.object({ reason: z.string().trim().min(1).max(500) });

/** Opciones de personas para el check-out (nombre y id, sin datos de contacto). */
export const assigneeSchema = refSchema;
