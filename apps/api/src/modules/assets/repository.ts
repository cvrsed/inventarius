import type { AssetFilters, AssetSortSpec } from '@inventarius/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { alias, type AnyPgColumn as AnyColumn } from 'drizzle-orm/pg-core';
import type { Executor } from '../../core/db/executor.js';
import { subtreeIdsSql } from '../../core/db/location-tree.js';
import {
  assetAssignments,
  assetLorawan,
  assets,
  lnsRegistrations,
  categories,
  locations,
  manufacturers,
  models,
  statusLabels,
  users,
} from '../../core/db/schema.js';

const assignedLocation = alias(locations, 'assigned_location');
const baseLocation = alias(locations, 'base_location');
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
  baseLocationId: string | null;
  baseLocationName: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  assignedLocationId: string | null;
  assignedLocationName: string | null;
  purchaseDate: string | null;
  purchaseCost: string | null;
  purchaseCurrency: string;
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
  devEui: string | null;
  lnsStatus: string | null;
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
    | 'baseLocationId'
    | 'purchaseDate'
    | 'purchaseCost'
    | 'purchaseCurrency'
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

/** La ubicación (columna) es la elegida o está debajo de ella, a cualquier profundidad. */
const inSubtree = (column: AnyColumn, rootId: string): SQL =>
  sql`${column} IN ${subtreeIdsSql(rootId)}`;

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
        baseLocationId: assets.baseLocationId,
        baseLocationName: baseLocation.name,
        assignedUserId: assets.assignedUserId,
        assignedUserName: users.name,
        assignedLocationId: assets.assignedLocationId,
        assignedLocationName: assignedLocation.name,
        purchaseDate: assets.purchaseDate,
        purchaseCost: assets.purchaseCost,
        purchaseCurrency: assets.purchaseCurrency,
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
        devEui: assetLorawan.devEui,
        lnsStatus: lnsRegistrations.status,
      })
      .from(assets)
      .innerJoin(models, eq(models.id, assets.modelId))
      .innerJoin(manufacturers, eq(manufacturers.id, models.manufacturerId))
      .innerJoin(categories, eq(categories.id, models.categoryId))
      .innerJoin(statusLabels, eq(statusLabels.id, assets.statusId))
      .leftJoin(locations, eq(locations.id, assets.locationId))
      .leftJoin(baseLocation, eq(baseLocation.id, assets.baseLocationId))
      .leftJoin(users, eq(users.id, assets.assignedUserId))
      .leftJoin(assignedLocation, eq(assignedLocation.id, assets.assignedLocationId))
      .leftJoin(
        openAssignment,
        and(eq(openAssignment.assetId, assets.id), isNull(openAssignment.checkedInAt)),
      )
      .leftJoin(assetLorawan, eq(assetLorawan.assetId, assets.id))
      .leftJoin(lnsRegistrations, eq(lnsRegistrations.assetId, assets.id));
  }

  private where(f: AssetFilters, today: string): SQL | undefined {
    const term = f.q ? `%${escapeLike(f.q)}%` : undefined;
    return and(
      term
        ? or(
            sql`${assets.assetTag}::text ILIKE ${term}`,
            ilike(assets.name, term),
            ilike(assets.serial, term),
            ilike(assetLorawan.devEui, term),
          )
        : undefined,
      f.categoryId ? eq(models.categoryId, f.categoryId) : undefined,
      f.modelId ? eq(assets.modelId, f.modelId) : undefined,
      f.statusId ? eq(assets.statusId, f.statusId) : undefined,
      f.locationId ? inSubtree(assets.locationId, f.locationId) : undefined,
      f.assignedUserId ? eq(assets.assignedUserId, f.assignedUserId) : undefined,
      f.baseLocationId ? inSubtree(assets.baseLocationId, f.baseLocationId) : undefined,
      f.statusKind ? eq(statusLabels.kind, f.statusKind) : undefined,
      f.assigned === 'yes'
        ? or(isNotNull(assets.assignedUserId), isNotNull(assets.assignedLocationId))
        : undefined,
      f.assigned === 'no'
        ? and(isNull(assets.assignedUserId), isNull(assets.assignedLocationId))
        : undefined,
      f.lnsStatus === 'none' ? isNull(lnsRegistrations.status) : undefined,
      f.lnsStatus && f.lnsStatus !== 'none' ? eq(lnsRegistrations.status, f.lnsStatus) : undefined,
      f.overdue ? sql`${openAssignment.expectedReturnOn} < ${today}::date` : undefined,
      f.deleted === 'exclude' ? isNull(assets.deletedAt) : undefined,
      f.deleted === 'only' ? isNotNull(assets.deletedAt) : undefined,
    );
  }

  async list(
    exec: Executor,
    filters: AssetFilters,
    sort: AssetSortSpec,
    page: { limit: number; offset: number },
    today: string,
  ): Promise<{ rows: AssetRow[]; total: number }> {
    const where = this.where(filters, today);
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
        .innerJoin(statusLabels, eq(statusLabels.id, assets.statusId))
        .leftJoin(
          openAssignment,
          and(eq(openAssignment.assetId, assets.id), isNull(openAssignment.checkedInAt)),
        )
        .leftJoin(assetLorawan, eq(assetLorawan.assetId, assets.id))
        .leftJoin(lnsRegistrations, eq(lnsRegistrations.assetId, assets.id))
        .where(where),
    ]);
    return { rows, total: totals[0]?.n ?? 0 };
  }

  async getById(exec: Executor, id: string): Promise<AssetRow | undefined> {
    return (await this.select(exec).where(eq(assets.id, id)).limit(1))[0];
  }

  /** Activos con alguno de esos números de serie (sin distinguir mayúsculas), para la importación CSV (RF-66). */
  async bySerials(
    exec: Executor,
    serials: string[],
  ): Promise<
    {
      id: string;
      assetTag: string;
      serial: string;
      deleted: boolean;
      categoryExtension: string;
      modelName: string;
      modelNumber: string | null;
    }[]
  > {
    if (!serials.length) return [];
    const rows = await exec
      .select({
        id: assets.id,
        assetTag: sql<string>`${assets.assetTag}::text`,
        serial: assets.serial,
        deletedAt: assets.deletedAt,
        categoryExtension: categories.extension,
        modelName: models.name,
        modelNumber: models.modelNumber,
      })
      .from(assets)
      .innerJoin(models, eq(models.id, assets.modelId))
      .innerJoin(categories, eq(categories.id, models.categoryId))
      .where(
        inArray(
          sql`lower(${assets.serial})`,
          serials.map((x) => x.toLowerCase()),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      assetTag: r.assetTag,
      serial: r.serial ?? '',
      deleted: r.deletedAt !== null,
      categoryExtension: r.categoryExtension,
      modelName: r.modelName,
      modelNumber: r.modelNumber,
    }));
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

  /** Reserva `n` correlativos de etiqueta de una vez, en orden. */
  async nextTagNumbers(exec: Executor, n: number): Promise<bigint[]> {
    const res = await exec.execute<{ n: string }>(
      sql`SELECT nextval('asset_tag_seq') AS n FROM generate_series(1, ${n}::int) AS g(i) ORDER BY g.i`,
    );
    return res.rows.map((r) => BigInt(r.n));
  }

  async insertMany(exec: Executor, rows: NewAsset[]): Promise<{ id: string; assetTag: string }[]> {
    const out = await exec
      .insert(assets)
      .values(rows)
      .returning({ id: assets.id, assetTag: sql<string>`${assets.assetTag}::text` });
    return out;
  }

  /** Series de la lista que ya tiene algún activo de ese modelo (vigente o dado de baja), sin distinguir mayúsculas. */
  async existingSerials(
    exec: Executor,
    modelId: string,
    serials: readonly string[],
  ): Promise<string[]> {
    if (!serials.length) return [];
    const lowered = serials.map((s) => s.trim().toLowerCase());
    const rows = await exec
      .select({ serial: assets.serial })
      .from(assets)
      .where(
        and(eq(assets.modelId, modelId), inArray(sql<string>`lower(${assets.serial})`, lowered)),
      );
    return rows.flatMap((r) => (r.serial ? [r.serial] : []));
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
    v: {
      userId: string | null;
      /** Sitio de la asignación (o `null`). */
      locationId: string | null;
      /** Ubicación actual tras el cambio: el sitio, la bodega de devolución o `null` con una persona. */
      currentLocationId: string | null;
      statusId: string;
    },
  ): Promise<void> {
    await exec
      .update(assets)
      .set({
        assignedUserId: v.userId,
        assignedLocationId: v.locationId,
        locationId: v.currentLocationId,
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
