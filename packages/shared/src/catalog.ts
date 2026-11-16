import { z } from 'zod';
import { pageQuerySchema } from './identity.js';

/** Tipo de extensión de una categoría (RF-10). `lorawan` agrega la sección LoRaWAN a la ficha (F3). */
export const CATEGORY_EXTENSIONS = ['none', 'lorawan'] as const;
export const categoryExtensionSchema = z.enum(CATEGORY_EXTENSIONS);
export type CategoryExtension = z.infer<typeof categoryExtensionSchema>;

/** Tipo de estado (RF-13): solo los `deployable` se pueden asignar (RF-23). */
export const STATUS_KINDS = ['deployable', 'pending', 'undeployable', 'archived'] as const;
export const statusKindSchema = z.enum(STATUS_KINDS);
export type StatusKind = z.infer<typeof statusKindSchema>;

export const LORAWAN_CLASSES = ['A', 'B', 'C'] as const;
export const lorawanClassSchema = z.enum(LORAWAN_CLASSES);

const name = z.string().trim().min(1).max(120);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

export const refSchema = z.object({ id: z.uuid(), name: z.string() });
export type Ref = z.infer<typeof refSchema>;

/** Filtro común de los listados del catálogo. */
export const catalogListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  /** `true` = solo activos (para los selectores de formularios), `false` = solo inactivos. */
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  sort: z.string().max(40).optional(),
});
export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>;

const versioned = { updatedAt: z.iso.datetime() };

// --- Categorías (RF-10) ---
export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  extension: categoryExtensionSchema,
  active: z.boolean(),
  ...versioned,
});
export type CategoryDto = z.infer<typeof categorySchema>;
export const createCategorySchema = z.object({
  name,
  extension: categoryExtensionSchema.default('none'),
});
export const updateCategorySchema = z
  .object({ name, extension: categoryExtensionSchema, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');

// --- Fabricantes (RF-11) ---
export const manufacturerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  active: z.boolean(),
  ...versioned,
});
export type ManufacturerDto = z.infer<typeof manufacturerSchema>;
export const createManufacturerSchema = z.object({ name });
export const updateManufacturerSchema = z
  .object({ name, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');

// --- Modelos (RF-11) ---
export const assetModelSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  modelNumber: z.string().nullable(),
  manufacturer: refSchema,
  category: refSchema.extend({ extension: categoryExtensionSchema }),
  active: z.boolean(),
  /** Solo en modelos de categoría `lorawan`. */
  lorawanClass: lorawanClassSchema.nullable(),
  lorawanVersion: z.string().nullable(),
  lorawanRegionalParameters: z.string().nullable(),
  ...versioned,
});
export type AssetModelDto = z.infer<typeof assetModelSchema>;
const modelFields = {
  name,
  modelNumber: optionalText(80),
  manufacturerId: z.uuid(),
  categoryId: z.uuid(),
  lorawanClass: lorawanClassSchema.nullable(),
  lorawanVersion: optionalText(20),
  lorawanRegionalParameters: optionalText(20),
};
export const createModelSchema = z.object({
  ...modelFields,
  modelNumber: modelFields.modelNumber.default(null),
  lorawanClass: modelFields.lorawanClass.default(null),
  lorawanVersion: modelFields.lorawanVersion.default(null),
  lorawanRegionalParameters: modelFields.lorawanRegionalParameters.default(null),
});
export const updateModelSchema = z
  .object({ ...modelFields, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');
export const modelListQuerySchema = catalogListQuerySchema.extend({
  manufacturerId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
});

// --- Ubicaciones (RF-12) ---
export const locationSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parent: refSchema.nullable(),
  /** Ruta completa, p. ej. «Cliente > Edificio > Piso». */
  path: z.string(),
  address: z.string().nullable(),
  active: z.boolean(),
  ...versioned,
});
export type LocationDto = z.infer<typeof locationSchema>;
export const createLocationSchema = z.object({
  name,
  parentId: z.uuid().nullable().default(null),
  address: optionalText(240).default(null),
});
export const updateLocationSchema = z
  .object({ name, parentId: z.uuid().nullable(), address: optionalText(240), active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');

// --- Estados (RF-13) ---
export const statusLabelSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: statusKindSchema,
  active: z.boolean(),
  /** El estado `Asignado` lo usa el check-out y no se puede renombrar ni borrar. */
  isSystem: z.boolean(),
  ...versioned,
});
export type StatusLabelDto = z.infer<typeof statusLabelSchema>;
export const createStatusLabelSchema = z.object({ name, kind: statusKindSchema });
export const updateStatusLabelSchema = z
  .object({ name, kind: statusKindSchema, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');
