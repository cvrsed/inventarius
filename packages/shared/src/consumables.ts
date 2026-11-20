import { z } from 'zod';
import { pageQuerySchema } from './identity.js';
import { refSchema } from './catalog.js';

// --- Cantidades decimales ---------------------------------------------------------------------------------------
// Las cantidades viajan como texto («2.5») y se calculan con enteros escalados (milésimas): nunca con `number`,
// para no arrastrar errores de coma flotante. Postgres las guarda como `numeric(14,3)`.

/** Máximo de decimales que admite el sistema; cada unidad permite entre 0 y este valor. */
export const MAX_QUANTITY_DECIMALS = 3;
const MAX_INTEGER_DIGITS = 10;
const SCALE = 10n ** BigInt(MAX_QUANTITY_DECIMALS);
const QUANTITY_RE = new RegExp(
  `^(\\d{1,${MAX_INTEGER_DIGITS}})(?:\\.(\\d{1,${MAX_QUANTITY_DECIMALS}}))?$`,
);

/** Convierte «2.5» en milésimas (2500n). Lanza si el texto no es una cantidad válida. */
export function toMilli(value: string): bigint {
  const m = QUANTITY_RE.exec(value);
  if (!m) throw new Error(`Cantidad inválida: «${value}»`);
  const decimals = (m[2] ?? '').padEnd(MAX_QUANTITY_DECIMALS, '0');
  return BigInt(m[1]!) * SCALE + BigInt(decimals);
}

/** Milésimas a texto canónico (sin ceros sobrantes). Admite negativos (resultados de restas). */
export function fromMilli(milli: bigint): string {
  const negative = milli < 0n;
  const abs = negative ? -milli : milli;
  const int = abs / SCALE;
  const frac = (abs % SCALE).toString().padStart(MAX_QUANTITY_DECIMALS, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
}

/** Forma canónica de una cantidad válida: «2.50» → «2.5». Lanza si no es válida. */
export function normalizeQuantity(value: string): string {
  return fromMilli(toMilli(value));
}

/** Forma canónica de una cantidad que puede llevar signo (los `delta` del libro): «-2.50» → «-2.5». */
export function normalizeDelta(value: string): string {
  return value.startsWith('-') ? `-${normalizeQuantity(value.slice(1))}` : normalizeQuantity(value);
}

function signedToMilli(value: string): bigint {
  return value.startsWith('-') ? -toMilli(value.slice(1)) : toMilli(value);
}

/** Suma un `delta` con signo a un saldo: «1» + «-2.5» → «-1.5». */
export function addDelta(balance: string, delta: string): string {
  return fromMilli(signedToMilli(balance) + signedToMilli(delta));
}

/** Cambia el signo de un `delta` del libro. */
export function negateDelta(delta: string): string {
  return delta.startsWith('-') ? delta.slice(1) : `-${delta}`;
}

export function isQuantity(value: string): boolean {
  return QUANTITY_RE.test(value);
}

export function isPositiveQuantity(value: string): boolean {
  return toMilli(value) > 0n;
}

/** ¿Los decimales significativos de la cantidad caben en una unidad que permite `decimals`? («12.0» cabe en 0). */
export function quantityFitsUnit(value: string, decimals: number): boolean {
  const frac = normalizeQuantity(value).split('.')[1] ?? '';
  return frac.length <= decimals;
}

export function addQuantities(a: string, b: string): string {
  return fromMilli(toMilli(a) + toMilli(b));
}

export function subtractQuantities(a: string, b: string): string {
  return fromMilli(toMilli(a) - toMilli(b));
}

export function compareQuantities(a: string, b: string): -1 | 0 | 1 {
  const x = toMilli(a);
  const y = toMilli(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Lo que hace falta de una unidad para mostrar una cantidad. */
export interface QuantityUnit {
  name: string;
  /** Nombre en plural («pares»). */
  plural: string;
  abbreviation: string;
  decimals: number;
}

/** Número decimal en texto («1234.5») con el formato es-CL («1.234,5»), sin pasar por `number`. */
export function formatDecimal(value: string): string {
  const negative = value.startsWith('-');
  const [int = '0', frac] = (negative ? value.slice(1) : value).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${frac ? `${grouped},${frac}` : grouped}`;
}

/**
 * Cantidad para mostrar en es-CL: coma decimal y punto de miles. Las unidades enteras usan su nombre con la
 * concordancia correcta («1 par», «12 pares»); las fraccionarias, su abreviatura («2,5 L»).
 */
export function formatQuantity(value: string, unit: QuantityUnit): string {
  const text = fromMilli(toMilli(value));
  const number = formatDecimal(text);
  if (unit.decimals > 0) return `${number} ${unit.abbreviation}`;
  return `${number} ${text === '1' ? unit.name : unit.plural}`;
}

/** Cantidad como texto: valida el formato y entrega la forma canónica. */
export const quantitySchema = z
  .string()
  .trim()
  .refine(isQuantity, 'Cantidad inválida: usa números con punto decimal (hasta 3 decimales)')
  .transform(normalizeQuantity);

/** Cantidad mayor que cero. */
export const positiveQuantitySchema = quantitySchema.refine(
  (v) => isPositiveQuantity(v),
  'La cantidad debe ser mayor que cero',
);

// --- Unidades de medida (D4) ---------------------------------------------------------------------------------------

const unitName = z.string().trim().min(1).max(40);
const decimalsSchema = z.number().int().min(0).max(MAX_QUANTITY_DECIMALS);

export const measureUnitSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  plural: z.string(),
  abbreviation: z.string(),
  /** Decimales que admite una cantidad en esta unidad (0 a 3). */
  decimals: decimalsSchema,
  active: z.boolean(),
  updatedAt: z.iso.datetime(),
  /** Solo en listados con `withUsage=true`. */
  inUse: z.boolean().optional(),
});
export type MeasureUnitDto = z.infer<typeof measureUnitSchema>;
export const createMeasureUnitSchema = z.object({
  name: unitName,
  plural: unitName,
  abbreviation: z.string().trim().min(1).max(12),
  decimals: decimalsSchema,
});
export const updateMeasureUnitSchema = z
  .object({
    name: unitName,
    plural: unitName,
    abbreviation: z.string().trim().min(1).max(12),
    decimals: decimalsSchema,
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');

export const unitRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  plural: z.string(),
  abbreviation: z.string(),
  decimals: decimalsSchema,
});
export type UnitRef = z.infer<typeof unitRefSchema>;

// --- Consumables (RF-70) ---------------------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable();

const warehouseMinimumSchema = z.object({
  locationId: z.uuid(),
  minQuantity: positiveQuantitySchema,
});

const consumableFields = {
  name: z.string().trim().min(1).max(120),
  categoryId: z.uuid(),
  unitId: z.uuid(),
  notes: optionalText(500),
  /** Mínimo global: se compara con el total de todas las bodegas. Nulo = sin mínimo. */
  minStock: positiveQuantitySchema.nullable(),
  /** Mínimos por bodega: reemplazan por completo a los anteriores. */
  warehouseMinimums: z.array(warehouseMinimumSchema).max(200),
};
export const createConsumableSchema = z.object({
  ...consumableFields,
  notes: consumableFields.notes.default(null),
  minStock: consumableFields.minStock.default(null),
  warehouseMinimums: consumableFields.warehouseMinimums.default([]),
});
export const updateConsumableSchema = z
  .object({ ...consumableFields, active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');

const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
export const consumableListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(100).optional(),
  categoryId: z.uuid().optional(),
  active: booleanQuery.optional(),
  /** `true`: solo los que están bajo su mínimo (global o de alguna bodega). */
  lowStock: booleanQuery.optional(),
  sort: z.string().max(40).optional(),
});
export type ConsumableListQuery = z.infer<typeof consumableListQuerySchema>;

export const consumableSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  category: refSchema,
  unit: unitRefSchema,
  notes: z.string().nullable(),
  minStock: z.string().nullable(),
  /** Suma de todas las bodegas. */
  totalStock: z.string(),
  /** Total bajo el mínimo global. */
  belowMinimum: z.boolean(),
  /** Cuántas bodegas están bajo su propio mínimo. */
  warehousesBelowMinimum: z.number().int(),
  /** Bajo el mínimo global o en alguna bodega. */
  lowStock: z.boolean(),
  active: z.boolean(),
  /** Con movimientos no se borra, solo se desactiva (D10). */
  hasMovements: z.boolean(),
  updatedAt: z.iso.datetime(),
});
export type ConsumableDto = z.infer<typeof consumableSchema>;

export const warehouseStockSchema = z.object({
  location: z.object({ id: z.uuid(), name: z.string(), path: z.string(), active: z.boolean() }),
  quantity: z.string(),
  minQuantity: z.string().nullable(),
  belowMinimum: z.boolean(),
});
export type WarehouseStockDto = z.infer<typeof warehouseStockSchema>;

export const consumableDetailSchema = consumableSchema.extend({
  stockByWarehouse: z.array(warehouseStockSchema),
});
export type ConsumableDetailDto = z.infer<typeof consumableDetailSchema>;

// --- Movimientos (D2, RF-71 a RF-73) ----------------------------------------------------------------------------

export const MOVEMENT_KINDS = [
  'receipt',
  'delivery',
  'adjustment',
  'transfer_out',
  'transfer_in',
  'reversal',
] as const;
export const movementKindSchema = z.enum(MOVEMENT_KINDS);
export type MovementKind = z.infer<typeof movementKindSchema>;

/** Motivos de un ajuste (D6). «Otro» exige nota. */
export const ADJUSTMENT_REASONS = ['physical_count', 'waste_damage', 'loss', 'other'] as const;
export const adjustmentReasonSchema = z.enum(ADJUSTMENT_REASONS);
export type AdjustmentReason = z.infer<typeof adjustmentReasonSchema>;

const note = optionalText(500);
const requiredReason = z.string().trim().min(1, 'Indica el motivo').max(300);

export const receiptSchema = z.object({
  locationId: z.uuid(),
  quantity: positiveQuantitySchema,
  /** Fecha del ingreso (hoy por defecto; no puede ser futura). */
  receivedOn: z.iso.date().optional(),
  supplier: optionalText(120).default(null),
  note: note.default(null),
});
export type ReceiptInput = z.infer<typeof receiptSchema>;

const personName = z.string().trim().min(1).max(120);
export const deliverySchema = z
  .object({
    locationId: z.uuid(),
    quantity: positiveQuantitySchema,
    /** Usuario del sistema que recibe. */
    recipientUserId: z.uuid().optional(),
    /** O una persona en texto libre, con un identificador opcional (sin validar formato). */
    recipientName: personName.optional(),
    recipientRef: z
      .string()
      .trim()
      .max(40)
      .transform((v) => (v === '' ? undefined : v))
      .optional(),
    note: note.default(null),
  })
  .superRefine((v, ctx) => {
    if (!v.recipientUserId && !v.recipientName) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipientName'],
        message: 'Indica quién recibe: una persona del sistema o su nombre',
      });
    }
    if (v.recipientUserId && v.recipientName) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipientName'],
        message: 'Elige una persona del sistema o escribe un nombre, no ambos',
      });
    }
    if (v.recipientUserId && v.recipientRef) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipientRef'],
        message: 'El identificador solo se usa con un nombre escrito a mano',
      });
    }
  });
export type DeliveryInput = z.infer<typeof deliverySchema>;

export const ADJUSTMENT_DIRECTIONS = ['add', 'subtract'] as const;
export const adjustmentSchema = z
  .object({
    locationId: z.uuid(),
    direction: z.enum(ADJUSTMENT_DIRECTIONS),
    quantity: positiveQuantitySchema,
    reason: adjustmentReasonSchema,
    note: note.default(null),
  })
  .superRefine((v, ctx) => {
    if (v.reason === 'other' && !v.note) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Con el motivo «otro» la nota es obligatoria',
      });
    }
  });
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const transferSchema = z
  .object({
    fromLocationId: z.uuid(),
    toLocationId: z.uuid(),
    quantity: positiveQuantitySchema,
    note: note.default(null),
  })
  .superRefine((v, ctx) => {
    if (v.fromLocationId === v.toLocationId) {
      ctx.addIssue({
        code: 'custom',
        path: ['toLocationId'],
        message: 'El destino debe ser distinto del origen',
      });
    }
  });
export type TransferInput = z.infer<typeof transferSchema>;

export const reversalSchema = z.object({ reason: requiredReason });
export type ReversalInput = z.infer<typeof reversalSchema>;

export const movementSchema = z.object({
  id: z.uuid(),
  kind: movementKindSchema,
  location: z.object({ id: z.uuid(), name: z.string() }),
  /** Cantidad con signo respecto de la bodega (suma o resta). */
  delta: z.string(),
  occurredAt: z.iso.datetime(),
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  supplier: z.string().nullable(),
  note: z.string().nullable(),
  reason: z.string().nullable(),
  recipient: z
    .object({ userId: z.uuid().nullable(), name: z.string(), ref: z.string().nullable() })
    .nullable(),
  /** La otra bodega de un traslado (o de su anulación). */
  counterpartLocation: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  /** Este movimiento fue anulado por otro. */
  reversedBy: z
    .object({ id: z.uuid(), at: z.iso.datetime(), actorName: z.string().nullable() })
    .nullable(),
  /** Este movimiento es la anulación de otro. */
  reverses: z.object({ id: z.uuid(), kind: movementKindSchema, at: z.iso.datetime() }).nullable(),
  /** Se puede anular: no es una anulación ni fue anulado. */
  reversible: z.boolean(),
});
export type MovementDto = z.infer<typeof movementSchema>;

export const movementListQuerySchema = pageQuerySchema.extend({
  locationId: z.uuid().optional(),
  kind: movementKindSchema.optional(),
  /** Fechas (inclusive), día calendario de la zona horaria de la instalación. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type MovementListQuery = z.infer<typeof movementListQuerySchema>;

/** Resultado de registrar un movimiento: el movimiento y el saldo que quedó en la bodega. */
export const movementResultSchema = z.object({
  movements: z.array(movementSchema),
  /** Saldo de cada bodega tocada, ya con el movimiento. */
  balances: z.array(z.object({ locationId: z.uuid(), quantity: z.string() })),
});
export type MovementResult = z.infer<typeof movementResultSchema>;

/** Receptor elegible de una entrega: persona del sistema (nombre e id, sin contacto). */
export const recipientSchema = refSchema;
