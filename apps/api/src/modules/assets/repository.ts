import type { AssetFilters, AssetSortSpec } from '@inventarius/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../../core/db/executor.js';
import {
  assetAssignments,
  assets,
  categories,
  locations,
  manufacturers,
  models,
  statusLabels,
  users,
} from '../../core/db/schema.js';

const assignedLocation = alias(locations, 'assigned_location');
const openAssignment = alias(assetAssignments, 'open_assignment');

/** Activo con los nombres de lo que referencia y su asignación abierta, si la hay. */
export interface AssetRow {
  id: string;
  assetTag: string;
  name: string;
  serial: string | null;
  modelId: string;
  modelName: string;
  manufacturerId: string;
  manufacturerName: string;
  categoryId: string;
  categoryName: string;
  categoryExtension: string;
  statusId: string;
  statusName: string;
  statusKind: string;
  locationId: string | null;
  locationName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedLocationId: string | null;
  assignedLocationName: string | null;
  purchaseDate: string | null;
  purchaseCost: string | null;
  supplier: string | null;
  warrantyMonths: number | null;
  notes: string | null;
  deletedAt: Date | null;
  deleteReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  assignmentSince: Date | null;
  assignmentExpectedReturnOn: string | null;
  assignmentNote: string | null;
}

export type NewAsset = Omit<typeof assets.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>;
export type AssetChanges = Partial<
  Pick<
    typeof assets.$inferInsert,
    | 'assetTag'
    | 'name'
    | 'serial'
    | 'modelId'
    | 'statusId'
    | 'locationId'
    | 'purchaseDate'
    | 'purchaseCost'
    | 'supplier'
    | 'warrantyMonths'
    | 'notes'
  >
>;

const SORT_COLUMNS = {
  assetTag: sql`${assets.assetTag}::text`,
  name: assets.name,
  status: statusLabels.name,
  model: models.name,
  location: locations.name,
  purchaseDate: assets.purchaseDate,
  createdAt: assets.createdAt,
} as const;

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Acceso a `assets` y `asset_assignments`. El listado hace JOIN de solo lectura con las tablas del catálogo
 * y con `users` (nombre del asignado): es la única forma de filtrar y ordenar por esos nombres en una
 * sola consulta paginada (RNF-06). Las escrituras sobre otros módulos pasan siempre por sus servicios.
 */
export class AssetsRepository {
  private select(exec: Executor) {
    return exec
      .select({
        id: assets.id,
        assetTag: sql<string>`${assets.assetTag}::text`,
        name: assets.name,
        serial: assets.serial,
        modelId: assets.modelId,
        modelName: models.name,
        manufacturerId: manufacturers.id,
        manufacturerName: manufacturers.name,
        categoryId: categories.id,
        categoryName: categories.name,
        categoryExtension: categories.extension,
        statusId: assets.statusId,
        statusName: statusLabels.name,
        statusKind: statusLabels.kind,
        locationId: assets.locationId,
        locationName: locations.name,
        assignedUserId: assets.assignedUserId,
        assignedUserName: users.name,
        assignedLocationId: assets.assignedLocationId,
        assignedLocationName: assignedLocation.name,
        purchaseDate: assets.purchaseDate,
        purchaseCost: assets.purchaseCost,
        supplier: assets.supplier,
        warrantyMonths: assets.warrantyMonths,
        notes: assets.notes,
        deletedAt: assets.deletedAt,
        deleteReason: assets.deleteReason,
        createdAt: assets.createdAt,
        updatedAt: assets.updatedAt,
        assignmentSince: openAssignment.checkedOutAt,
        assignmentExpectedReturnOn: openAssignment.expectedReturnOn,
        assignmentNote: openAssignment.checkoutNote,
      })
      .from(assets)
      .innerJoin(models, eq(models.id, assets.modelId))
      .innerJoin(manufacturers, eq(manufacturers.id, models.manufacturerId))
      .innerJoin(categories, eq(categories.id, models.categoryId))
      .innerJoin(statusLabels, eq(statusLabels.id, assets.statusId))
      .leftJoin(locations, eq(locations.id, assets.locationId))
      .leftJoin(users, eq(users.id, assets.assignedUserId))
      .leftJoin(assignedLocation, eq(assignedLocation.id, assets.assignedLocationId))
      .leftJoin(
        openAssignment,
        and(eq(openAssignment.assetId, assets.id), isNull(openAssignment.checkedInAt)),
      );
  }

  private where(f: AssetFilters): SQL | undefined {
    const term = f.q ? `%${escapeLike(f.q)}%` : undefined;
    return and(
      term
        ? or(
            sql`${assets.assetTag}::text ILIKE ${term}`,
            ilike(assets.name, term),
            ilike(assets.serial, term),
          )
        : undefined,
      f.categoryId ? eq(models.categoryId, f.categoryId) : undefined,
      f.modelId ? eq(assets.modelId, f.modelId) : undefined,
      f.statusId ? eq(assets.statusId, f.statusId) : undefined,
      f.locationId ? eq(assets.locationId, f.locationId) : undefined,
      f.assignedUserId ? eq(assets.assignedUserId, f.assignedUserId) : undefined,
      f.deleted === 'exclude' ? isNull(assets.deletedAt) : undefined,
      f.deleted === 'only' ? isNotNull(assets.deletedAt) : undefined,
    );
  }

  async list(
    exec: Executor,
    filters: AssetFilters,
    sort: AssetSortSpec,
    page: { limit: number; offset: number },
  ): Promise<{ rows: AssetRow[]; total: number }> {
    const where = this.where(filters);
    const column = SORT_COLUMNS[sort.key];
    const [rows, totals] = await Promise.all([
      this.select(exec)
        .where(where)
        .orderBy(sort.desc ? desc(column) : asc(column), asc(assets.id))
        .limit(page.limit)
        .offset(page.offset),
      exec
        .select({ n: count() })
        .from(assets)
        .innerJoin(models, eq(models.id, assets.modelId))
        .where(where),
    ]);
    return { rows, total: totals[0]?.n ?? 0 };
  }

  async getById(exec: Executor, id: string): Promise<AssetRow | undefined> {
    return (await this.select(exec).where(eq(assets.id, id)).limit(1))[0];
  }

  /** Bloquea la fila hasta el fin de la transacción: serializa asignaciones y ediciones simultáneas. */
  async lock(exec: Executor, id: string): Promise<boolean> {
    const rows = await exec
      .select({ id: assets.id })
      .from(assets)
      .where(eq(assets.id, id))
      .for('update');
    return rows.length > 0;
  }

  async nextTagNumber(exec: Executor): Promise<bigint> {
    const res = await exec.execute<{ n: string }>(sql`SELECT nextval('asset_tag_seq') AS n`);
    return BigInt(res.rows[0]!.n);
  }

  async insert(exec: Executor, v: NewAsset): Promise<string> {
    return (await exec.insert(assets).values(v).returning({ id: assets.id }))[0]!.id;
  }

  async update(exec: Executor, id: string, v: AssetChanges): Promise<void> {
    await exec
      .update(assets)
      .set({ ...v, updatedAt: sql`now()` })
      .where(eq(assets.id, id));
  }

  async setDeleted(exec: Executor, id: string, reason: string | null): Promise<void> {
    await exec
      .update(assets)
      .set(
        reason === null
          ? { deletedAt: null, deleteReason: null, updatedAt: sql`now()` }
          : { deletedAt: sql`now()`, deleteReason: reason, updatedAt: sql`now()` },
      )
      .where(eq(assets.id, id));
  }

  async setAssignee(
    exec: Executor,
    id: string,
    v: { userId: string | null; locationId: string | null; statusId: string },
  ): Promise<void> {
    await exec
      .update(assets)
      .set({
        assignedUserId: v.userId,
        assignedLocationId: v.locationId,
        statusId: v.statusId,
        updatedAt: sql`now()`,
      })
      .where(eq(assets.id, id));
  }

  async openAssignmentFor(
    exec: Executor,
    v: {
      assetId: string;
      userId: string | null;
      locationId: string | null;
      by: string | null;
      expectedReturnOn: string | null;
      note: string | null;
    },
  ): Promise<void> {
    await exec.insert(assetAssignments).values({
      assetId: v.assetId,
      userId: v.userId,
      locationId: v.locationId,
      checkedOutBy: v.by,
      expectedReturnOn: v.expectedReturnOn,
      checkoutNote: v.note,
    });
  }

  async closeAssignment(
    exec: Executor,
    assetId: string,
    v: { by: string | null; note: string | null },
  ): Promise<void> {
    await exec
      .update(assetAssignments)
      .set({ checkedInAt: sql`now()`, checkedInBy: v.by, checkinNote: v.note })
      .where(and(eq(assetAssignments.assetId, assetId), isNull(assetAssignments.checkedInAt)));
  }
}
