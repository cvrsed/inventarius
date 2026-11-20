import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** `citext`: comparación sin distinguir mayúsculas (extensión creada en la migración 0000). */
const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const inet = customType<{ data: string }>({ dataType: () => 'inet' });

const pk = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

/**
 * Metadatos de la instalación (clave/valor). Sirve para comprobar que las migraciones
 * corrieron y como ancla de la primera migración.
 */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: pk(),
  email: citext('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const roles = pgTable('roles', {
  id: pk(),
  name: text('name').notNull().unique(),
  description: text('description').notNull().default(''),
  /** Los roles semilla no se pueden borrar. */
  isSystem: boolean('is_system').notNull().default(false),
  /** Administrador: además tiene la matriz de permisos fija. */
  isProtected: boolean('is_protected').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Catálogo fijo definido en código (`packages/shared`) y sembrado por migración. */
export const permissions = pgTable('permissions', {
  key: text('key').primaryKey(),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permission: text('permission')
      .notNull()
      .references(() => permissions.key),
  },
  (t) => [
    primaryKey({ columns: [t.roleId, t.permission] }),
    index('role_permissions_permission_idx').on(t.permission),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] }), index('user_roles_role_idx').on(t.roleId)],
);

/** Sesiones: `id` es el SHA-256 del token de la cookie; el token en claro nunca se guarda. */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** Expiración absoluta, independiente de la actividad. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

/** Contadores de intentos fallidos por cuenta (`account:<email>`) y por IP (`ip:<ip>`), RF-05. */
export const loginThrottle = pgTable('login_throttle', {
  key: text('key').primaryKey(),
  failures: integer('failures').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  updatedAt: updatedAt(),
});

/** Append-only: la migración y el migrador quitan UPDATE/DELETE al usuario de la app (RF-30). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: uuid('actor_id').references(() => users.id),
    /** Quién actuó cuando no hay un usuario: `cli` para la operación por línea de comandos. */
    actorLabel: text('actor_label'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id'),
    /** Rótulo legible del registro afectado, congelado al momento del evento (sobrevive a renombres y borrados). */
    entityLabel: text('entity_label'),
    diff: jsonb('diff').$type<Record<string, unknown>>(),
    ip: inet('ip'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_at_idx').on(t.at),
    index('audit_log_actor_idx').on(t.actorId),
    index('audit_log_entity_idx').on(t.entity, t.entityId),
  ],
);

// --- Catálogo (RF-10 a RF-14) ---

export const categories = pgTable(
  'categories',
  {
    id: pk(),
    name: citext('name').notNull(),
    /** `none` | `lorawan`: con `lorawan` la ficha del activo suma la sección LoRaWAN (F3). */
    extension: text('extension').notNull().default('none'),
    /** `asset` (modelos de activos) | `consumable` (consumibles, F3.5). No cambia después de creada. */
    scope: text('scope').notNull().default('asset'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // El nombre es único dentro de su ámbito: «Cables» puede existir como categoría de activos y de consumibles.
    uniqueIndex('categories_scope_name_lower_uq').on(t.scope, sql`lower(${t.name})`),
  ],
);

export const manufacturers = pgTable('manufacturers', {
  id: pk(),
  name: citext('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const models = pgTable(
  'models',
  {
    id: pk(),
    name: text('name').notNull(),
    modelNumber: text('model_number'),
    manufacturerId: uuid('manufacturer_id')
      .notNull()
      .references(() => manufacturers.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    active: boolean('active').notNull().default(true),
    lorawanClass: text('lorawan_class'),
    lorawanRegion: text('lorawan_region'),
    lorawanVersion: text('lorawan_version'),
    lorawanRegionalParameters: text('lorawan_regional_parameters'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('models_manufacturer_idx').on(t.manufacturerId),
    index('models_category_idx').on(t.categoryId),
    uniqueIndex('models_manufacturer_name_uq').on(t.manufacturerId, t.name),
  ],
);

export const locations = pgTable(
  'locations',
  {
    id: pk(),
    name: text('name').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => locations.id, {
      onDelete: 'restrict',
    }),
    /** `warehouse` | `customer_site` | `office` | `other` (RF-12). */
    type: text('type').notNull().default('other'),
    address: text('address'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('locations_parent_idx').on(t.parentId),
    check(
      'locations_type_chk',
      sql`${t.type} IN ('warehouse', 'customer_site', 'office', 'other')`,
    ),
  ],
);

export const statusLabels = pgTable('status_labels', {
  id: pk(),
  name: citext('name').notNull().unique(),
  /** `deployable` | `pending` | `undeployable` | `archived` (RF-13). */
  kind: text('kind').notNull(),
  active: boolean('active').notNull().default(true),
  /** Estado que el sistema usa por nombre lógico (`assigned`); no se renombra ni se borra. */
  systemKey: text('system_key').unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// --- Activos (RF-20 a RF-26) ---

export const assets = pgTable(
  'assets',
  {
    id: pk(),
    assetTag: citext('asset_tag').notNull().unique(),
    name: text('name').notNull(),
    serial: text('serial'),
    modelId: uuid('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'restrict' }),
    statusId: uuid('status_id')
      .notNull()
      .references(() => statusLabels.id, { onDelete: 'restrict' }),
    /** Ubicación actual: nula mientras lo tiene una persona (RF-23). */
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    /** Bodega donde vive el activo; a ella vuelve al devolverse (RF-20). */
    baseLocationId: uuid('base_location_id').references(() => locations.id, {
      onDelete: 'restrict',
    }),
    assignedUserId: uuid('assigned_user_id').references(() => users.id, { onDelete: 'restrict' }),
    assignedLocationId: uuid('assigned_location_id').references(() => locations.id, {
      onDelete: 'restrict',
    }),
    purchaseDate: date('purchase_date', { mode: 'string' }),
    purchaseCost: numeric('purchase_cost', { precision: 12, scale: 2 }),
    purchaseCurrency: text('purchase_currency').notNull().default('CLP'),
    supplier: text('supplier'),
    warrantyMonths: integer('warranty_months'),
    notes: text('notes'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deleteReason: text('delete_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('assets_model_idx').on(t.modelId),
    index('assets_status_idx').on(t.statusId),
    index('assets_location_idx').on(t.locationId),
    index('assets_base_location_idx').on(t.baseLocationId),
    index('assets_assigned_user_idx').on(t.assignedUserId),
    index('assets_assigned_location_idx').on(t.assignedLocationId),
    index('assets_created_idx').on(t.createdAt, t.id),
    // Búsqueda de texto (RF-22): `%término%` sobre etiqueta, nombre y serie usa estos índices trigram.
    index('assets_tag_trgm_idx').using('gin', sql`(${t.assetTag}::text) gin_trgm_ops`),
    index('assets_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('assets_serial_trgm_idx').using('gin', sql`${t.serial} gin_trgm_ops`),
    // La serie es única por modelo y sin distinguir mayúsculas (marcas distintas pueden repetirla); bajas incluidas.
    uniqueIndex('assets_model_serial_lower_uq')
      .on(t.modelId, sql`lower(${t.serial})`)
      .where(sql`${t.serial} IS NOT NULL`),
    check(
      'assets_one_assignee_chk',
      sql`${t.assignedUserId} IS NULL OR ${t.assignedLocationId} IS NULL`,
    ),
  ],
);

/** Historial de asignaciones (RF-23): una fila abierta (`checked_in_at` nulo) por activo asignado. */
export const assetAssignments = pgTable(
  'asset_assignments',
  {
    id: pk(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
    checkedOutAt: timestamp('checked_out_at', { withTimezone: true }).notNull().defaultNow(),
    checkedOutBy: uuid('checked_out_by').references(() => users.id, { onDelete: 'restrict' }),
    expectedReturnOn: date('expected_return_on', { mode: 'string' }),
    checkoutNote: text('checkout_note'),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }),
    checkedInBy: uuid('checked_in_by').references(() => users.id, { onDelete: 'restrict' }),
    checkinNote: text('checkin_note'),
  },
  (t) => [
    index('asset_assignments_user_idx').on(t.userId),
    index('asset_assignments_location_idx').on(t.locationId),
    index('asset_assignments_asset_idx').on(t.assetId),
    uniqueIndex('asset_assignments_open_uq')
      .on(t.assetId)
      .where(sql`${t.checkedInAt} IS NULL`),
    check(
      'asset_assignments_one_target_chk',
      sql`(${t.userId} IS NULL) <> (${t.locationId} IS NULL)`,
    ),
  ],
);

// --- LoRaWAN (RF-21, RF-50 a RF-66) ---

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/** Extensión 1:1 del activo (sección 5.2). AppKey y NwkKey se guardan cifradas (AES-256-GCM, `key_id`). */
export const assetLorawan = pgTable(
  'asset_lorawan',
  {
    assetId: uuid('asset_id')
      .primaryKey()
      .references(() => assets.id, { onDelete: 'restrict' }),
    devEui: text('dev_eui').unique(),
    joinEui: text('join_eui'),
    appKeyEnc: bytea('app_key_enc'),
    nwkKeyEnc: bytea('nwk_key_enc'),
    /** Clave maestra con que se cifraron `app_key_enc` y `nwk_key_enc`. */
    keyId: text('key_id'),
    activation: text('activation').notNull().default('OTAA'),
    deviceClass: text('device_class'),
    lorawanVersion: text('lorawan_version'),
    region: text('region'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('asset_lorawan_dev_eui_chk', sql`${t.devEui} IS NULL OR ${t.devEui} ~ '^[0-9A-F]{16}$'`),
    check(
      'asset_lorawan_join_eui_chk',
      sql`${t.joinEui} IS NULL OR ${t.joinEui} ~ '^[0-9A-F]{16}$'`,
    ),
  ],
);

/** Conexión guardada a un Network Server (RF-50). La credencial va cifrada y no vuelve al frontend. */
export const lnsProfiles = pgTable(
  'lns_profiles',
  {
    id: pk(),
    /** `chirpstack` | `ttn`. */
    kind: text('kind').notNull(),
    name: citext('name').notNull().unique(),
    description: text('description'),
    endpoint: text('endpoint').notNull(),
    tls: boolean('tls').notNull().default(false),
    credentialEnc: bytea('credential_enc').notNull(),
    credentialHint: text('credential_hint').notNull(),
    keyId: text('key_id').notNull(),
    target: jsonb('target').$type<Record<string, string>>().notNull(),
    deviceDefaults: jsonb('device_defaults').$type<Record<string, string>>().notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('lns_profiles_kind_chk', sql`${t.kind} IN ('chirpstack', 'ttn')`)],
);

/** Registro de un activo en un LNS (RF-61, RF-65: uno por activo). */
export const lnsRegistrations = pgTable(
  'lns_registrations',
  {
    id: pk(),
    assetId: uuid('asset_id')
      .notNull()
      .unique()
      .references(() => assets.id, { onDelete: 'restrict' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => lnsProfiles.id, { onDelete: 'restrict' }),
    /** `registering` | `registered` | `error` | `partial` | `conflict` | `deregistering`. */
    status: text('status').notNull(),
    externalId: text('external_id'),
    /** `created` (lo creó Inventarius) | `linked` (existía y se vinculó sin tocarlo, RF-64). */
    origin: text('origin').notNull().default('created'),
    stepsDone: jsonb('steps_done').$type<string[]>().notNull().default([]),
    /** Componentes que quedaron en el LNS cuando la compensación falló (`partial`). */
    orphans: jsonb('orphans').$type<string[]>().notNull().default([]),
    /** Qué operación dejó el estado actual (`register` | `deregister`); el reintento retoma esa. */
    lastOperation: text('last_operation').notNull().default('register'),
    lastError: text('last_error'),
    attempts: integer('attempts').notNull().default(0),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'restrict' }),
    registeredAt: timestamp('registered_at', { withTimezone: true }),
    /** Lo que el LNS tenía del dispositivo al vincularlo (sin claves, solo si están): se muestra en la ficha. */
    remoteSnapshot: jsonb('remote_snapshot').$type<{
      name: string;
      joinEui: string | null;
      deviceProfileId: string | null;
      /** Ausente en snapshots anteriores a la revisión 2. */
      deviceProfile?: { name: string | null; version: string | null; region: string | null } | null;
      hasAppKey: boolean;
      hasNwkKey: boolean;
      /** Ausente en snapshots anteriores a la revisión 2. */
      missingKeys?: ('appKey' | 'nwkKey')[];
      readAt: string;
    }>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('lns_registrations_profile_idx').on(t.profileId),
    index('lns_registrations_status_idx').on(t.status),
    check(
      'lns_registrations_status_chk',
      sql`${t.status} IN ('registering', 'registered', 'error', 'partial', 'conflict', 'deregistering')`,
    ),
    check('lns_registrations_origin_chk', sql`${t.origin} IN ('created', 'linked')`),
    check('lns_registrations_operation_chk', sql`${t.lastOperation} IN ('register', 'deregister')`),
  ],
);

// --- Consumibles (RF-70 a RF-74, ADR 0008) ---

/** Unidades de medida administrables (D4): cuántos decimales admite una cantidad en cada una. */
export const measureUnits = pgTable(
  'measure_units',
  {
    id: pk(),
    name: citext('name').notNull().unique(),
    plural: text('plural').notNull(),
    abbreviation: text('abbreviation').notNull(),
    decimals: integer('decimals').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('measure_units_decimals_chk', sql`${t.decimals} BETWEEN 0 AND 3`)],
);

export const consumables = pgTable(
  'consumables',
  {
    id: pk(),
    name: citext('name').notNull().unique(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => measureUnits.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    /** Mínimo global (contra el total de todas las bodegas). Nulo = sin mínimo. */
    minStock: numeric('min_stock', { precision: 14, scale: 3 }),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('consumables_category_idx').on(t.categoryId),
    index('consumables_unit_idx').on(t.unitId),
    check('consumables_min_stock_chk', sql`${t.minStock} IS NULL OR ${t.minStock} > 0`),
  ],
);

/** Mínimo de un consumible en una bodega concreta (se compara con el saldo de esa bodega). */
export const consumableWarehouseMinimums = pgTable(
  'consumable_warehouse_minimums',
  {
    consumableId: uuid('consumable_id')
      .notNull()
      .references(() => consumables.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    minQuantity: numeric('min_quantity', { precision: 14, scale: 3 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.consumableId, t.locationId] }),
    index('consumable_minimums_location_idx').on(t.locationId),
    check('consumable_minimums_qty_chk', sql`${t.minQuantity} > 0`),
  ],
);

/**
 * Libro de movimientos: append-only (la app no tiene UPDATE ni DELETE, D2) y fuente de verdad del stock.
 * `delta` lleva el signo respecto de la bodega; el saldo de una bodega es la suma de sus `delta`.
 */
export const consumableMovements = pgTable(
  'consumable_movements',
  {
    id: pk(),
    consumableId: uuid('consumable_id')
      .notNull()
      .references(() => consumables.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    /** `receipt` | `delivery` | `adjustment` | `transfer_out` | `transfer_in` | `reversal`. */
    kind: text('kind').notNull(),
    delta: numeric('delta', { precision: 14, scale: 3 }).notNull(),
    /** Cuándo ocurrió (en un ingreso puede ser una fecha pasada); `created_at` es cuándo se registró. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    supplier: text('supplier'),
    /** Nota libre; en una anulación es el motivo (obligatorio). */
    note: text('note'),
    /** Solo en ajustes: `physical_count` | `waste_damage` | `loss` | `other`. */
    reason: text('reason'),
    recipientUserId: uuid('recipient_user_id').references(() => users.id, { onDelete: 'restrict' }),
    recipientName: text('recipient_name'),
    recipientRef: text('recipient_ref'),
    /** Une la salida y la entrada de un traslado (y las dos de su anulación). */
    transferId: uuid('transfer_id'),
    /** En una anulación, el movimiento que anula; único: un movimiento se anula una sola vez. */
    reversesId: uuid('reverses_id')
      .unique()
      .references((): AnyPgColumn => consumableMovements.id, { onDelete: 'restrict' }),
    /** En una devolución, la entrega que devuelve (varias devoluciones parciales pueden apuntar a la misma). */
    returnsId: uuid('returns_id').references((): AnyPgColumn => consumableMovements.id, {
      onDelete: 'restrict',
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index('consumable_movements_returns_idx').on(t.returnsId),
    index('consumable_movements_consumable_idx').on(t.consumableId, t.occurredAt, t.id),
    index('consumable_movements_location_idx').on(t.locationId),
    index('consumable_movements_transfer_idx').on(t.transferId),
    index('consumable_movements_recipient_idx').on(t.recipientUserId),
    check(
      'consumable_movements_kind_chk',
      sql`${t.kind} IN ('receipt', 'delivery', 'return', 'adjustment', 'transfer_out', 'transfer_in', 'reversal')`,
    ),
    check('consumable_movements_delta_chk', sql`${t.delta} <> 0`),
    check(
      'consumable_movements_sign_chk',
      sql`(${t.kind} IN ('receipt', 'transfer_in', 'return') AND ${t.delta} > 0) OR (${t.kind} IN ('delivery', 'transfer_out') AND ${t.delta} < 0) OR ${t.kind} IN ('adjustment', 'reversal')`,
    ),
    check(
      'consumable_movements_recipient_chk',
      sql`(${t.kind} IN ('delivery', 'return') AND ((${t.recipientUserId} IS NULL) <> (${t.recipientName} IS NULL)) AND (${t.recipientRef} IS NULL OR ${t.recipientName} IS NOT NULL)) OR (${t.kind} NOT IN ('delivery', 'return') AND ${t.recipientUserId} IS NULL AND ${t.recipientName} IS NULL AND ${t.recipientRef} IS NULL)`,
    ),
    check(
      'consumable_movements_reversal_chk',
      sql`(${t.kind} = 'reversal') = (${t.reversesId} IS NOT NULL) AND (${t.kind} <> 'reversal' OR ${t.note} IS NOT NULL)`,
    ),
    check(
      'consumable_movements_return_chk',
      sql`(${t.kind} = 'return') = (${t.returnsId} IS NOT NULL)`,
    ),
    check(
      'consumable_movements_transfer_chk',
      sql`${t.kind} NOT IN ('transfer_out', 'transfer_in') OR ${t.transferId} IS NOT NULL`,
    ),
    check(
      'consumable_movements_reason_chk',
      sql`(${t.kind} = 'adjustment' AND ${t.reason} IN ('physical_count', 'waste_damage', 'loss', 'other') AND (${t.reason} <> 'other' OR ${t.note} IS NOT NULL)) OR (${t.kind} <> 'adjustment' AND ${t.reason} IS NULL)`,
    ),
  ],
);

/**
 * Saldo materializado por (consumible, bodega). Se actualiza en la misma transacción que el movimiento, con la fila
 * bloqueada (`FOR UPDATE`), y el CHECK impide que quede negativo aunque falle una regla de la app (D3).
 * `consumables:verify` compara cada saldo con la suma del libro (D2).
 */
export const consumableStock = pgTable(
  'consumable_stock',
  {
    consumableId: uuid('consumable_id')
      .notNull()
      .references(() => consumables.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 14, scale: 3 }).notNull().default('0'),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.consumableId, t.locationId] }),
    index('consumable_stock_location_idx').on(t.locationId),
    check('consumable_stock_non_negative_chk', sql`${t.quantity} >= 0`),
  ],
);
