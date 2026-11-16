import type { PgDatabase } from 'drizzle-orm/pg-core';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type * as schema from './schema.js';

/** Base común de la conexión y de una transacción: los repositorios aceptan cualquiera de las dos. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;
