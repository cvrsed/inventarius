import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { Executor } from './executor.js';
import {
  assets,
  categories,
  locations,
  manufacturers,
  models,
  roles,
  statusLabels,
  users,
} from './schema.js';

/**
 * Directorio de registros para la auditoría: dice cuáles de los ids siguen existiendo y vigentes (activos sin dar de
 * baja, usuarios y catálogo activos, roles). Vive en la raíz de composición para que `audit` no lea tablas ajenas.
 */
export class RecordDirectory {
  constructor(private readonly db: Executor) {}

  /** Ids de la entidad que existen y están vigentes. Las entidades sin ficha (p. ej. lotes) devuelven vacío. */
  async liveIds(entity: string, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await this.query(entity, ids);
    return new Set(rows.map((r) => r.id));
  }

  private query(entity: string, ids: string[]): Promise<{ id: string }[]> {
    const db = this.db;
    switch (entity) {
      case 'asset':
        return db
          .select({ id: assets.id })
          .from(assets)
          .where(and(inArray(assets.id, ids), isNull(assets.deletedAt)));
      case 'user':
        return db
          .select({ id: users.id })
          .from(users)
          .where(and(inArray(users.id, ids), eq(users.active, true)));
      case 'role':
        return db.select({ id: roles.id }).from(roles).where(inArray(roles.id, ids));
      case 'category':
        return db
          .select({ id: categories.id })
          .from(categories)
          .where(and(inArray(categories.id, ids), eq(categories.active, true)));
      case 'manufacturer':
        return db
          .select({ id: manufacturers.id })
          .from(manufacturers)
          .where(and(inArray(manufacturers.id, ids), eq(manufacturers.active, true)));
      case 'model':
        return db
          .select({ id: models.id })
          .from(models)
          .where(and(inArray(models.id, ids), eq(models.active, true)));
      case 'location':
        return db
          .select({ id: locations.id })
          .from(locations)
          .where(and(inArray(locations.id, ids), eq(locations.active, true)));
      case 'status_label':
        return db
          .select({ id: statusLabels.id })
          .from(statusLabels)
          .where(and(inArray(statusLabels.id, ids), eq(statusLabels.active, true)));
      default:
        return Promise.resolve([]);
    }
  }
}
