import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Executor } from '../../core/db/executor.js';
import {
  assetAssignments,
  assets,
  categories,
  consumableMovements,
  consumables,
  consumableStock,
  consumableWarehouseMinimums,
  locations,
  manufacturers,
  models,
  statusLabels,
} from '../../core/db/schema.js';

export interface ListOptions {
  /** Solo ubicaciones: deja solo ese tipo, o saca ese tipo. */
  type?: string | undefined;
  excludeType?: string | undefined;
  /** Solo categorías: `asset` o `consumable`. */
  scope?: string | undefined;
  q?: string | undefined;
  active?: boolean | undefined;
  sort?: string | undefined;
  limit: number;
  offset: number;
}

export type CategoryRow = typeof categories.$inferSelect;
export type ManufacturerRow = typeof manufacturers.$inferSelect;
export type StatusLabelRow = typeof statusLabels.$inferSelect;

export interface ModelRow {
  id: string;
  name: string;
  modelNumber: string | null;
  manufacturerId: string;
  manufacturerName: string;
  categoryId: string;
  categoryName: string;
  categoryExtension: string;
  active: boolean;
  lorawanClass: string | null;
  lorawanRegion: string | null;
  lorawanVersion: string | null;
  lorawanRegionalParameters: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type LocationRow = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  path: string;
  type: string;
  address: string | null;
  active: boolean;
  /** Consumibles con saldo mayor que cero en esta ubicación (solo tiene sentido en una bodega). */
  stockedConsumables: number;
  createdAt: Date;
  updatedAt: Date;
};

/** El driver entrega las fechas de una consulta SQL cruda como texto; se vuelven `Date` aquí. */
function withDates(row: LocationRow): LocationRow {
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}

export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Traduce `campo` o `-campo` a un ORDER BY usando solo columnas de la lista blanca; lo desconocido cae en el
 * orden por defecto. El `id` desempata para que la paginación sea estable.
 */
export function orderBy(
  sort: string | undefined,
  allowed: Record<string, PgColumn | SQL>,
  fallback: string,
  id: PgColumn,
): SQL[] {
  const desc_ = sort?.startsWith('-') ?? false;
  const key = (desc_ ? sort!.slice(1) : sort) ?? '';
  const column = allowed[key] ?? allowed[fallback]!;
  return [desc_ && key in allowed ? desc(column) : asc(column), asc(id)];
}

const pairCount = (rows: { n: number }[]) => rows[0]?.n ?? 0;

/** Acceso a las cinco tablas del catálogo (RF-10 a RF-14). */
export class CatalogRepository {
  // --- Categorías ---
  async listCategories(exec: Executor, o: ListOptions) {
    const where = and(
      o.q ? ilike(categories.name, `%${escapeLike(o.q)}%`) : undefined,
      o.active === undefined ? undefined : eq(categories.active, o.active),
      o.scope ? eq(categories.scope, o.scope) : undefined,
    );
    const [rows, totals] = await Promise.all([
      exec
        .select()
        .from(categories)
        .where(where)
        .orderBy(
          ...orderBy(
            o.sort,
            {
              name: categories.name,
              extension: categories.extension,
              scope: categories.scope,
              active: categories.active,
            },
            'name',
            categories.id,
          ),
        )
        .limit(o.limit)
        .offset(o.offset),
      exec.select({ n: count() }).from(categories).where(where),
    ]);
    return { rows, total: pairCount(totals) };
  }
  async getCategory(exec: Executor, id: string): Promise<CategoryRow | undefined> {
    return (await exec.select().from(categories).where(eq(categories.id, id)).limit(1))[0];
  }
  async insertCategory(exec: Executor, v: { name: string; extension: string; scope: string }) {
    return (await exec.insert(categories).values(v).returning())[0]!;
  }
  async updateCategory(
    exec: Executor,
    id: string,
    v: { name?: string; extension?: string; active?: boolean },
  ) {
    return (
      await exec
        .update(categories)
        .set({ ...v, updatedAt: sql`now()` })
        .where(eq(categories.id, id))
        .returning()
    )[0]!;
  }
  async deleteCategory(exec: Executor, id: string): Promise<void> {
    await exec.delete(categories).where(eq(categories.id, id));
  }
  async categoryInUse(exec: Executor, id: string): Promise<boolean> {
    const [asModels, asConsumables] = await Promise.all([
      exec.select({ n: count() }).from(models).where(eq(models.categoryId, id)),
      exec.select({ n: count() }).from(consumables).where(eq(consumables.categoryId, id)),
    ]);
    return pairCount(asModels) + pairCount(asConsumables) > 0;
  }

  // --- Fabricantes ---
  async listManufacturers(exec: Executor, o: ListOptions) {
    const where = and(
      o.q ? ilike(manufacturers.name, `%${escapeLike(o.q)}%`) : undefined,
      o.active === undefined ? undefined : eq(manufacturers.active, o.active),
    );
    const [rows, totals] = await Promise.all([
      exec
        .select()
        .from(manufacturers)
        .where(where)
        .orderBy(
          ...orderBy(
            o.sort,
            { name: manufacturers.name, active: manufacturers.active },
            'name',
            manufacturers.id,
          ),
        )
        .limit(o.limit)
        .offset(o.offset),
      exec.select({ n: count() }).from(manufacturers).where(where),
    ]);
    return { rows, total: pairCount(totals) };
  }
  async getManufacturer(exec: Executor, id: string): Promise<ManufacturerRow | undefined> {
    return (await exec.select().from(manufacturers).where(eq(manufacturers.id, id)).limit(1))[0];
  }
  async insertManufacturer(exec: Executor, v: { name: string }) {
    return (await exec.insert(manufacturers).values(v).returning())[0]!;
  }
  async updateManufacturer(exec: Executor, id: string, v: { name?: string; active?: boolean }) {
    return (
      await exec
        .update(manufacturers)
        .set({ ...v, updatedAt: sql`now()` })
        .where(eq(manufacturers.id, id))
        .returning()
    )[0]!;
  }
  async deleteManufacturer(exec: Executor, id: string): Promise<void> {
    await exec.delete(manufacturers).where(eq(manufacturers.id, id));
  }
  async manufacturerInUse(exec: Executor, id: string): Promise<boolean> {
    return (
      pairCount(
        await exec.select({ n: count() }).from(models).where(eq(models.manufacturerId, id)),
      ) > 0
    );
  }

  // --- Modelos ---
  private readonly modelColumns = {
    id: models.id,
    name: models.name,
    modelNumber: models.modelNumber,
    manufacturerId: models.manufacturerId,
    manufacturerName: manufacturers.name,
    categoryId: models.categoryId,
    categoryName: categories.name,
    categoryExtension: categories.extension,
    active: models.active,
    lorawanClass: models.lorawanClass,
    lorawanRegion: models.lorawanRegion,
    lorawanVersion: models.lorawanVersion,
    lorawanRegionalParameters: models.lorawanRegionalParameters,
    createdAt: models.createdAt,
    updatedAt: models.updatedAt,
  };
  private modelQuery(exec: Executor) {
    return exec
      .select(this.modelColumns)
      .from(models)
      .innerJoin(manufacturers, eq(manufacturers.id, models.manufacturerId))
      .innerJoin(categories, eq(categories.id, models.categoryId));
  }
  async listModels(
    exec: Executor,
    o: ListOptions & { manufacturerId?: string | undefined; categoryId?: string | undefined },
  ) {
    const term = o.q ? `%${escapeLike(o.q)}%` : undefined;
    const where = and(
      term
        ? or(
            ilike(models.name, term),
            ilike(models.modelNumber, term),
            ilike(manufacturers.name, term),
          )
        : undefined,
      o.active === undefined ? undefined : eq(models.active, o.active),
      o.manufacturerId ? eq(models.manufacturerId, o.manufacturerId) : undefined,
      o.categoryId ? eq(models.categoryId, o.categoryId) : undefined,
    );
    const [rows, totals] = await Promise.all([
      this.modelQuery(exec)
        .where(where)
        .orderBy(
          ...orderBy(
            o.sort,
            {
              name: models.name,
              modelNumber: models.modelNumber,
              manufacturer: manufacturers.name,
              category: categories.name,
              active: models.active,
            },
            'name',
            models.id,
          ),
        )
        .limit(o.limit)
        .offset(o.offset),
      exec
        .select({ n: count() })
        .from(models)
        .innerJoin(manufacturers, eq(manufacturers.id, models.manufacturerId))
        .where(where),
    ]);
    return { rows, total: pairCount(totals) };
  }
  async getModel(exec: Executor, id: string): Promise<ModelRow | undefined> {
    return (await this.modelQuery(exec).where(eq(models.id, id)).limit(1))[0];
  }
  async insertModel(exec: Executor, v: typeof models.$inferInsert): Promise<ModelRow> {
    const row = (await exec.insert(models).values(v).returning({ id: models.id }))[0]!;
    return (await this.getModel(exec, row.id))!;
  }
  async updateModel(
    exec: Executor,
    id: string,
    v: Partial<typeof models.$inferInsert>,
  ): Promise<ModelRow> {
    await exec
      .update(models)
      .set({ ...v, updatedAt: sql`now()` })
      .where(eq(models.id, id));
    return (await this.getModel(exec, id))!;
  }
  async deleteModel(exec: Executor, id: string): Promise<void> {
    await exec.delete(models).where(eq(models.id, id));
  }
  async modelInUse(exec: Executor, id: string): Promise<boolean> {
    return (
      pairCount(await exec.select({ n: count() }).from(assets).where(eq(assets.modelId, id))) > 0
    );
  }

  // --- Ubicaciones ---
  /** CTE con la ruta completa de cada ubicación («Cliente > Edificio > Piso»). */
  private readonly locationTree = sql`
    WITH RECURSIVE tree AS (
      SELECT id, name::text AS path FROM locations WHERE parent_id IS NULL
      UNION ALL
      SELECT l.id, t.path || ' > ' || l.name FROM locations l JOIN tree t ON l.parent_id = t.id
    )`;
  private readonly locationSelect = sql`
    SELECT l.id, l.name, l.parent_id AS "parentId", p.name AS "parentName", tree.path,
           l.type, l.address, l.active, l.created_at AS "createdAt", l.updated_at AS "updatedAt",
           (SELECT COUNT(*)::int FROM consumable_stock s
             WHERE s.location_id = l.id AND s.quantity > 0) AS "stockedConsumables"
    FROM locations l
    JOIN tree ON tree.id = l.id
    LEFT JOIN locations p ON p.id = l.parent_id`;

  async listLocations(
    exec: Executor,
    o: ListOptions,
  ): Promise<{ rows: LocationRow[]; total: number }> {
    const conds: SQL[] = [];
    if (o.q) {
      const term = `%${escapeLike(o.q)}%`;
      conds.push(sql`(tree.path ILIKE ${term} OR l.address ILIKE ${term})`);
    }
    if (o.active !== undefined) conds.push(sql`l.active = ${o.active}`);
    if (o.type) conds.push(sql`l.type = ${o.type}`);
    if (o.excludeType) conds.push(sql`l.type <> ${o.excludeType}`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const descending = o.sort?.startsWith('-') ?? false;
    const key = (descending ? o.sort!.slice(1) : o.sort) ?? '';
    const known = ['name', 'path', 'active'].includes(key);
    const dir = sql.raw(descending && known ? 'DESC' : 'ASC');
    const rows = await exec.execute<LocationRow & { total: string }>(sql`
      ${this.locationTree},
      page AS (${this.locationSelect} ${where})
      SELECT *, count(*) OVER () AS total FROM page
      ORDER BY ${sql.identifier(known ? key : 'path')} ${dir}, id
      LIMIT ${o.limit} OFFSET ${o.offset}`);
    const first = rows.rows[0];
    return { rows: rows.rows.map(withDates), total: first ? Number(first.total) : 0 };
  }
  async getLocation(exec: Executor, id: string): Promise<LocationRow | undefined> {
    const res = await exec.execute<LocationRow>(
      sql`${this.locationTree} ${this.locationSelect} WHERE l.id = ${id}`,
    );
    return res.rows[0] ? withDates(res.rows[0]) : undefined;
  }
  async insertLocation(
    exec: Executor,
    v: { name: string; parentId: string | null; type: string; address: string | null },
  ) {
    const row = (await exec.insert(locations).values(v).returning({ id: locations.id }))[0]!;
    return (await this.getLocation(exec, row.id))!;
  }
  async updateLocation(
    exec: Executor,
    id: string,
    v: {
      name?: string;
      parentId?: string | null;
      type?: string;
      address?: string | null;
      active?: boolean;
    },
  ) {
    await exec
      .update(locations)
      .set({ ...v, updatedAt: sql`now()` })
      .where(eq(locations.id, id));
    return (await this.getLocation(exec, id))!;
  }
  async deleteLocation(exec: Executor, id: string): Promise<void> {
    await exec.delete(locations).where(eq(locations.id, id));
  }
  /** Ids de la ubicación y de todas sus descendientes: sirve para impedir ciclos al cambiar el padre. */
  async subtreeIds(exec: Executor, id: string): Promise<string[]> {
    const res = await exec.execute<{ id: string }>(sql`
      WITH RECURSIVE sub AS (
        SELECT id FROM locations WHERE id = ${id}
        UNION ALL
        SELECT l.id FROM locations l JOIN sub s ON l.parent_id = s.id
      ) SELECT id FROM sub`);
    return res.rows.map((r) => r.id);
  }
  async locationInUse(exec: Executor, id: string): Promise<boolean> {
    const n = async (q: Promise<{ n: number }[]>) => pairCount(await q);
    const [children, located, based, assigned, assignments, stock, minimums, movements] =
      await Promise.all([
        n(exec.select({ n: count() }).from(locations).where(eq(locations.parentId, id))),
        n(exec.select({ n: count() }).from(assets).where(eq(assets.locationId, id))),
        n(exec.select({ n: count() }).from(assets).where(eq(assets.baseLocationId, id))),
        n(exec.select({ n: count() }).from(assets).where(eq(assets.assignedLocationId, id))),
        n(
          exec
            .select({ n: count() })
            .from(assetAssignments)
            .where(eq(assetAssignments.locationId, id)),
        ),
        n(
          exec
            .select({ n: count() })
            .from(consumableStock)
            .where(eq(consumableStock.locationId, id)),
        ),
        n(
          exec
            .select({ n: count() })
            .from(consumableWarehouseMinimums)
            .where(eq(consumableWarehouseMinimums.locationId, id)),
        ),
        n(
          exec
            .select({ n: count() })
            .from(consumableMovements)
            .where(eq(consumableMovements.locationId, id)),
        ),
      ]);
    return children + located + based + assigned + assignments + stock + minimums + movements > 0;
  }

  // --- Estados ---
  async listStatusLabels(exec: Executor, o: ListOptions) {
    const where = and(
      o.q ? ilike(statusLabels.name, `%${escapeLike(o.q)}%`) : undefined,
      o.active === undefined ? undefined : eq(statusLabels.active, o.active),
    );
    const [rows, totals] = await Promise.all([
      exec
        .select()
        .from(statusLabels)
        .where(where)
        .orderBy(
          ...orderBy(
            o.sort,
            { name: statusLabels.name, kind: statusLabels.kind, active: statusLabels.active },
            'name',
            statusLabels.id,
          ),
        )
        .limit(o.limit)
        .offset(o.offset),
      exec.select({ n: count() }).from(statusLabels).where(where),
    ]);
    return { rows, total: pairCount(totals) };
  }
  async getStatusLabel(exec: Executor, id: string): Promise<StatusLabelRow | undefined> {
    return (await exec.select().from(statusLabels).where(eq(statusLabels.id, id)).limit(1))[0];
  }
  async getStatusBySystemKey(exec: Executor, key: string): Promise<StatusLabelRow | undefined> {
    return (
      await exec.select().from(statusLabels).where(eq(statusLabels.systemKey, key)).limit(1)
    )[0];
  }
  async insertStatusLabel(exec: Executor, v: { name: string; kind: string }) {
    return (await exec.insert(statusLabels).values(v).returning())[0]!;
  }
  async updateStatusLabel(
    exec: Executor,
    id: string,
    v: { name?: string; kind?: string; active?: boolean },
  ) {
    return (
      await exec
        .update(statusLabels)
        .set({ ...v, updatedAt: sql`now()` })
        .where(eq(statusLabels.id, id))
        .returning()
    )[0]!;
  }
  async deleteStatusLabel(exec: Executor, id: string): Promise<void> {
    await exec.delete(statusLabels).where(eq(statusLabels.id, id));
  }
  async statusLabelInUse(exec: Executor, id: string): Promise<boolean> {
    return (
      pairCount(await exec.select({ n: count() }).from(assets).where(eq(assets.statusId, id))) > 0
    );
  }
}
