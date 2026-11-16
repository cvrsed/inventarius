import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Metadatos de la instalación (clave/valor). Sirve para comprobar que las migraciones
 * corrieron y como ancla de la primera migración; las tablas de negocio llegan desde F1.
 */
export const appMeta = pgTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
