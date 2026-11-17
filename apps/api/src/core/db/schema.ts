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

export const categories = pgTable('categories', {
  id: pk(),
  name: citext('name').notNull().unique(),
  /** `none` | `lorawan`: con `lorawan` la ficha del activo suma la sección LoRaWAN (F3). */
  extension: text('extension').notNull().default('none'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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
    address: text('address'),
    active: boolean('active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('locations_parent_idx').on(t.parentId)],
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
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'restrict' }),
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
    index('assets_assigned_user_idx').on(t.assignedUserId),
    index('assets_assigned_location_idx').on(t.assignedLocationId),
    index('assets_created_idx').on(t.createdAt, t.id),
    // Búsqueda de texto (RF-22): `%término%` sobre etiqueta, nombre y serie usa estos índices trigram.
    index('assets_tag_trgm_idx').using('gin', sql`(${t.assetTag}::text) gin_trgm_ops`),
    index('assets_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    index('assets_serial_trgm_idx').using('gin', sql`${t.serial} gin_trgm_ops`),
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
