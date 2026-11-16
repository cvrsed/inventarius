import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
