import { and, asc, count, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Executor } from '../../core/db/executor.js';
import {
  assetAssignments,
  assets,
  auditLog,
  categories,
  locations,
  models,
  statusLabels,
  users,
} from '../../core/db/schema.js';

const assignedToUser = alias(users, 'assigned_user');
const assignedToLocation = alias(locations, 'assigned_location');
const baseLocation = alias(locations, 'base_location');

const unassigned = and(isNull(assets.assignedUserId), isNull(assets.assignedLocationId));
const vigente = isNull(assets.deletedAt);

/**
 * Agregados del Inicio (RF-28). Solo lectura sobre las tablas de inventario; todo se cuenta en SQL y los
 * estados se agrupan por su `kind`, no por su nombre.
 */
export class DashboardRepository {
  async totals(exec: Executor) {
    const [row] = await exec
      .select({
        total: count(),
        available: sql<number>`count(*) filter (where ${statusLabels.kind} = 'deployable' and ${assets.assignedUserId} is null and ${assets.assignedLocationId} is null)::int`,
        assigned: sql<number>`count(*) filter (where ${assets.assignedUserId} is not null or ${assets.assignedLocationId} is not null)::int`,
        pendingSetup: sql<number>`count(*) filter (where ${statusLabels.kind} = 'pending')::int`,
      })
      .from(assets)
      .innerJoin(statusLabels, eq(statusLabels.id, assets.statusId))
      .where(vigente);
    return row!;
  }

  byStatus(exec: Executor) {
    return exec
      .select({
        id: statusLabels.id,
        name: statusLabels.name,
        kind: statusLabels.kind,
        count: count(),
      })
      .from(assets)
      .innerJoin(statusLabels, eq(statusLabels.id, assets.statusId))
      .where(vigente)
      .groupBy(statusLabels.id, statusLabels.name, statusLabels.kind);
  }

  byCategory(exec: Executor, limit: number) {
    return exec
      .select({ id: categories.id, name: categories.name, count: count() })
      .from(assets)
      .innerJoin(models, eq(models.id, assets.modelId))
      .innerJoin(categories, eq(categories.id, models.categoryId))
      .where(vigente)
      .groupBy(categories.id, categories.name)
      .orderBy(desc(count()), asc(categories.name))
      .limit(limit);
  }

  stockByWarehouse(exec: Executor, limit: number) {
    return exec
      .select({ id: baseLocation.id, name: baseLocation.name, count: count() })
      .from(assets)
      .innerJoin(statusLabels, eq(statusLabels.id, assets.statusId))
      .innerJoin(baseLocation, eq(baseLocation.id, assets.baseLocationId))
      .where(and(vigente, unassigned, eq(statusLabels.kind, 'deployable')))
      .groupBy(baseLocation.id, baseLocation.name)
      .orderBy(desc(count()), asc(baseLocation.name))
      .limit(limit);
  }

  private overdueWhere(today: string) {
    return and(
      vigente,
      isNull(assetAssignments.checkedInAt),
      sql`${assetAssignments.expectedReturnOn} < ${today}::date`,
    );
  }

  async overdueCount(exec: Executor, today: string): Promise<number> {
    const [row] = await exec
      .select({ n: count() })
      .from(assetAssignments)
      .innerJoin(assets, eq(assets.id, assetAssignments.assetId))
      .where(this.overdueWhere(today));
    return row?.n ?? 0;
  }

  overdueItems(exec: Executor, today: string, limit: number) {
    return exec
      .select({
        id: assets.id,
        assetTag: sql<string>`${assets.assetTag}::text`,
        name: assets.name,
        assignedTo: sql<
          string | null
        >`coalesce(${assignedToUser.name}, ${assignedToLocation.name})`,
        expectedReturnOn: sql<string>`${assetAssignments.expectedReturnOn}::text`,
      })
      .from(assetAssignments)
      .innerJoin(assets, eq(assets.id, assetAssignments.assetId))
      .leftJoin(assignedToUser, eq(assignedToUser.id, assets.assignedUserId))
      .leftJoin(assignedToLocation, eq(assignedToLocation.id, assets.assignedLocationId))
      .where(this.overdueWhere(today))
      .orderBy(asc(assetAssignments.expectedReturnOn), asc(assets.id))
      .limit(limit);
  }

  /** Últimos movimientos de activos, con la etiqueta y el nombre actuales de cada uno. */
  recent(exec: Executor, limit: number) {
    return exec
      .select({
        id: auditLog.id,
        at: auditLog.at,
        action: auditLog.action,
        actorId: auditLog.actorId,
        actorLabel: auditLog.actorLabel,
        entityId: auditLog.entityId,
        assetId: assets.id,
        assetTag: sql<string | null>`${assets.assetTag}::text`,
        assetName: assets.name,
      })
      .from(auditLog)
      .leftJoin(assets, eq(assets.id, auditLog.entityId))
      .where(eq(auditLog.entity, 'asset'))
      .orderBy(desc(auditLog.at), desc(auditLog.id))
      .limit(limit);
  }

  mine(exec: Executor, userId: string, limit: number) {
    return exec
      .select({
        id: assets.id,
        assetTag: sql<string>`${assets.assetTag}::text`,
        name: assets.name,
        since: assetAssignments.checkedOutAt,
        expectedReturnOn: sql<string | null>`${assetAssignments.expectedReturnOn}::text`,
      })
      .from(assets)
      .innerJoin(
        assetAssignments,
        and(eq(assetAssignments.assetId, assets.id), isNull(assetAssignments.checkedInAt)),
      )
      .where(and(vigente, eq(assets.assignedUserId, userId), isNotNull(assets.assignedUserId)))
      .orderBy(asc(assetAssignments.checkedOutAt))
      .limit(limit);
  }
}
