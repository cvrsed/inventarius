import { and, count, eq, ilike, sql, type SQL } from 'drizzle-orm';
import type { Executor } from '../../core/db/executor.js';
import {
  consumableMovements,
  consumableStock,
  consumableWarehouseMinimums,
  consumables,
  measureUnits,
} from '../../core/db/schema.js';
import { escapeLike, orderBy } from '../catalog/repository.js';

export type MeasureUnitRow = typeof measureUnits.$inferSelect;

export type ConsumableRow = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  unitId: string;
  unitName: string;
  unitPlural: string;
  unitAbbreviation: string;
  unitDecimals: number;
  notes: string | null;
  minStock: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  totalStock: string;
  warehousesBelow: number;
  hasMovements: boolean;
};

export interface ConsumableListOptions {
  q?: string | undefined;
  categoryId?: string | undefined;
  active?: boolean | undefined;
  lowStock?: boolean | undefined;
  sort?: string | undefined;
  limit: number;
  offset: number;
}

export type MovementRow = typeof consumableMovements.$inferSelect;

/** Un movimiento con lo necesario para armar el historial (vínculos de anulación y traslado). */
export interface MovementViewRow {
  id: string;
  kind: string;
  locationId: string;
  delta: string;
  occurredAt: Date;
  createdAt: Date;
  /** La fecha del movimiento (zona de la instalación) no es la del día en que se registró. */
  backdated: boolean;
  actorId: string;
  supplier: string | null;
  note: string | null;
  reason: string | null;
  recipientUserId: string | null;
  recipientName: string | null;
  recipientRef: string | null;
  transferId: string | null;
  counterpartLocationId: string | null;
  reversedById: string | null;
  reversedAt: Date | null;
  reversedByActorId: string | null;
  reversesId: string | null;
  reversesKind: string | null;
  reversesAt: Date | null;
  /** Solo en entregas: suma de las devoluciones vigentes (no anuladas). */
  returned: string | null;
  returnsId: string | null;
  returnsAt: Date | null;
}

export interface MovementFilters {
  locationId?: string | undefined;
  kind?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface NewMovement {
  consumableId: string;
  locationId: string;
  kind: string;
  delta: string;
  actorId: string;
  /** Día del ingreso (zona de la instalación); sin él, ahora. */
  occurredOn?: string | undefined;
  /** Zona horaria con la que se interpreta `occurredOn`. */
  timezone?: string | undefined;
  supplier?: string | null | undefined;
  note?: string | null | undefined;
  reason?: string | null | undefined;
  recipientUserId?: string | null | undefined;
  recipientName?: string | null | undefined;
  recipientRef?: string | null | undefined;
  transferId?: string | null | undefined;
  reversesId?: string | null | undefined;
  returnsId?: string | null | undefined;
}

export type LedgerMismatch = {
  consumableId: string;
  locationId: string;
  stock: string;
  ledger: string;
};

const pairCount = (rows: { n: number }[]) => rows[0]?.n ?? 0;
const toDate = (v: Date | string | null): Date | null => (v === null ? null : new Date(v));

const CONSUMABLE_SELECT = sql`
  SELECT c.id, c.name::text AS name, c.category_id AS "categoryId", cat.name::text AS "categoryName",
         c.unit_id AS "unitId", u.name::text AS "unitName", u.plural AS "unitPlural",
         u.abbreviation AS "unitAbbreviation", u.decimals AS "unitDecimals",
         c.notes, c.min_stock AS "minStock", c.active,
         c.created_at AS "createdAt", c.updated_at AS "updatedAt",
         COALESCE((SELECT SUM(s.quantity) FROM consumable_stock s WHERE s.consumable_id = c.id), 0) AS "totalStock",
         (SELECT COUNT(*) FROM consumable_warehouse_minimums m
            LEFT JOIN consumable_stock s ON s.consumable_id = m.consumable_id AND s.location_id = m.location_id
          WHERE m.consumable_id = c.id AND COALESCE(s.quantity, 0) < m.min_quantity)::int AS "warehousesBelow",
         EXISTS (SELECT 1 FROM consumable_movements mv WHERE mv.consumable_id = c.id) AS "hasMovements"
  FROM consumables c
  JOIN categories cat ON cat.id = c.category_id
  JOIN measure_units u ON u.id = c.unit_id`;

function withDates(row: ConsumableRow): ConsumableRow {
  return { ...row, createdAt: new Date(row.createdAt), updatedAt: new Date(row.updatedAt) };
}

/** Acceso a consumibles, unidades, saldos y al libro de movimientos. Sin reglas de negocio. */
export class ConsumablesRepository {
  // --- Unidades de medida ---

  async listUnits(
    exec: Executor,
    o: {
      q?: string | undefined;
      active?: boolean | undefined;
      sort?: string | undefined;
      limit: number;
      offset: number;
    },
  ) {
    const where = and(
      o.q ? ilike(measureUnits.name, `%${escapeLike(o.q)}%`) : undefined,
      o.active === undefined ? undefined : eq(measureUnits.active, o.active),
    );
    const [rows, totals] = await Promise.all([
      exec
        .select()
        .from(measureUnits)
        .where(where)
        .orderBy(
          ...orderBy(
            o.sort,
            {
              name: measureUnits.name,
              decimals: measureUnits.decimals,
              active: measureUnits.active,
            },
            'name',
            measureUnits.id,
          ),
        )
        .limit(o.limit)
        .offset(o.offset),
      exec.select({ n: count() }).from(measureUnits).where(where),
    ]);
    return { rows, total: pairCount(totals) };
  }
  async getUnit(exec: Executor, id: string): Promise<MeasureUnitRow | undefined> {
    return (await exec.select().from(measureUnits).where(eq(measureUnits.id, id)).limit(1))[0];
  }
  async insertUnit(
    exec: Executor,
    v: { name: string; plural: string; abbreviation: string; decimals: number },
  ) {
    return (await exec.insert(measureUnits).values(v).returning())[0]!;
  }
  async updateUnit(
    exec: Executor,
    id: string,
    v: {
      name?: string;
      plural?: string;
      abbreviation?: string;
      decimals?: number;
      active?: boolean;
    },
  ) {
    return (
      await exec
        .update(measureUnits)
        .set({ ...v, updatedAt: sql`now()` })
        .where(eq(measureUnits.id, id))
        .returning()
    )[0]!;
  }
  async deleteUnit(exec: Executor, id: string): Promise<void> {
    await exec.delete(measureUnits).where(eq(measureUnits.id, id));
  }
  async unitInUse(exec: Executor, id: string): Promise<boolean> {
    return (
      pairCount(
        await exec.select({ n: count() }).from(consumables).where(eq(consumables.unitId, id)),
      ) > 0
    );
  }

  // --- Consumibles ---

  async list(
    exec: Executor,
    o: ConsumableListOptions,
  ): Promise<{ rows: ConsumableRow[]; total: number }> {
    const conds: SQL[] = [];
    if (o.q) conds.push(sql`name ILIKE ${`%${escapeLike(o.q)}%`}`);
    if (o.categoryId) conds.push(sql`"categoryId" = ${o.categoryId}`);
    if (o.active !== undefined) conds.push(sql`active = ${o.active}`);
    if (o.lowStock) {
      conds.push(
        sql`active AND (("minStock" IS NOT NULL AND "totalStock" < "minStock") OR "warehousesBelow" > 0)`,
      );
    }
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const desc = o.sort?.startsWith('-') ?? false;
    const key = (desc ? o.sort!.slice(1) : o.sort) ?? '';
    const columns: Record<string, string> = {
      name: 'name',
      category: '"categoryName"',
      totalStock: '"totalStock"',
      active: 'active',
    };
    const column = sql.raw(columns[key] ?? 'name');
    const dir = sql.raw(desc && key in columns ? 'DESC' : 'ASC');
    const res = await exec.execute<ConsumableRow & { rowTotal: string }>(sql`
      WITH base AS (${CONSUMABLE_SELECT})
      SELECT *, count(*) OVER () AS "rowTotal" FROM base ${where}
      ORDER BY ${column} ${dir}, id
      LIMIT ${o.limit} OFFSET ${o.offset}`);
    const first = res.rows[0];
    return { rows: res.rows.map(withDates), total: first ? Number(first.rowTotal) : 0 };
  }

  async get(exec: Executor, id: string): Promise<ConsumableRow | undefined> {
    const res = await exec.execute<ConsumableRow>(sql`${CONSUMABLE_SELECT} WHERE c.id = ${id}`);
    return res.rows[0] ? withDates(res.rows[0]) : undefined;
  }

  /** Bloquea la fila del consumible en modo compartido: no se puede desactivar mientras hay un movimiento en curso. */
  async lockShared(exec: Executor, id: string): Promise<boolean> {
    const res = await exec.execute(sql`SELECT 1 FROM consumables WHERE id = ${id} FOR SHARE`);
    return res.rows.length > 0;
  }

  async insert(
    exec: Executor,
    v: {
      name: string;
      categoryId: string;
      unitId: string;
      notes: string | null;
      minStock: string | null;
    },
  ) {
    return (await exec.insert(consumables).values(v).returning({ id: consumables.id }))[0]!;
  }

  async update(
    exec: Executor,
    id: string,
    v: {
      name?: string;
      categoryId?: string;
      unitId?: string;
      notes?: string | null;
      minStock?: string | null;
      active?: boolean;
    },
  ): Promise<void> {
    await exec
      .update(consumables)
      .set({ ...v, updatedAt: sql`now()` })
      .where(eq(consumables.id, id));
  }

  async remove(exec: Executor, id: string): Promise<void> {
    await exec
      .delete(consumableWarehouseMinimums)
      .where(eq(consumableWarehouseMinimums.consumableId, id));
    await exec.delete(consumableStock).where(eq(consumableStock.consumableId, id));
    await exec.delete(consumables).where(eq(consumables.id, id));
  }

  async hasMovements(exec: Executor, id: string): Promise<boolean> {
    return (
      pairCount(
        await exec
          .select({ n: count() })
          .from(consumableMovements)
          .where(eq(consumableMovements.consumableId, id)),
      ) > 0
    );
  }

  // --- Mínimos por bodega ---

  async minimums(
    exec: Executor,
    consumableId: string,
  ): Promise<{ locationId: string; minQuantity: string }[]> {
    return exec
      .select({
        locationId: consumableWarehouseMinimums.locationId,
        minQuantity: consumableWarehouseMinimums.minQuantity,
      })
      .from(consumableWarehouseMinimums)
      .where(eq(consumableWarehouseMinimums.consumableId, consumableId));
  }

  async replaceMinimums(
    exec: Executor,
    consumableId: string,
    rows: { locationId: string; minQuantity: string }[],
  ): Promise<void> {
    await exec
      .delete(consumableWarehouseMinimums)
      .where(eq(consumableWarehouseMinimums.consumableId, consumableId));
    if (rows.length) {
      await exec
        .insert(consumableWarehouseMinimums)
        .values(rows.map((r) => ({ consumableId, ...r })));
    }
  }

  // --- Saldos ---

  /** Saldo (y mínimo) por bodega: las que tienen fila de saldo o mínimo. */
  async stockByWarehouse(
    exec: Executor,
    consumableId: string,
  ): Promise<{ locationId: string; quantity: string; minQuantity: string | null }[]> {
    const res = await exec.execute<{
      locationId: string;
      quantity: string;
      minQuantity: string | null;
    }>(sql`
      SELECT k.location_id AS "locationId", COALESCE(s.quantity, 0) AS quantity, m.min_quantity AS "minQuantity"
      FROM (SELECT location_id FROM consumable_stock WHERE consumable_id = ${consumableId}
            UNION
            SELECT location_id FROM consumable_warehouse_minimums WHERE consumable_id = ${consumableId}) k
      LEFT JOIN consumable_stock s ON s.consumable_id = ${consumableId} AND s.location_id = k.location_id
      LEFT JOIN consumable_warehouse_minimums m ON m.consumable_id = ${consumableId} AND m.location_id = k.location_id`);
    return res.rows;
  }

  /**
   * Garantiza la fila de saldo de cada bodega y la bloquea (`FOR UPDATE`) en orden de id, para que dos movimientos
   * sobre el mismo (consumible, bodega) se serialicen y dos que cruzan bodegas no se bloqueen entre sí (D3).
   * Devuelve el saldo visto con el bloqueo tomado.
   */
  async lockStock(
    exec: Executor,
    consumableId: string,
    locationIds: string[],
  ): Promise<Map<string, string>> {
    const ordered = [...new Set(locationIds)].sort();
    for (const locationId of ordered) {
      await exec.insert(consumableStock).values({ consumableId, locationId }).onConflictDoNothing();
    }
    const res = await exec.execute<{ locationId: string; quantity: string }>(sql`
      SELECT location_id AS "locationId", quantity FROM consumable_stock
      WHERE consumable_id = ${consumableId}
        AND location_id IN (${sql.join(
          ordered.map((id) => sql`${id}`),
          sql`, `,
        )})
      ORDER BY location_id FOR UPDATE`);
    return new Map(res.rows.map((r) => [r.locationId, r.quantity]));
  }

  /** Suma `delta` (con signo) al saldo ya bloqueado y devuelve el nuevo. El CHECK de la tabla es el último respaldo. */
  async applyDelta(
    exec: Executor,
    consumableId: string,
    locationId: string,
    delta: string,
  ): Promise<string> {
    const res = await exec.execute<{ quantity: string }>(sql`
      UPDATE consumable_stock SET quantity = quantity + ${delta}::numeric, updated_at = now()
      WHERE consumable_id = ${consumableId} AND location_id = ${locationId}
      RETURNING quantity`);
    return res.rows[0]!.quantity;
  }

  // --- Libro de movimientos ---

  async insertMovement(exec: Executor, m: NewMovement): Promise<string> {
    const occurredAt = m.occurredOn
      ? sql`(${m.occurredOn}::date + time '12:00') AT TIME ZONE ${m.timezone}`
      : undefined;
    const row = (
      await exec
        .insert(consumableMovements)
        .values({
          consumableId: m.consumableId,
          locationId: m.locationId,
          kind: m.kind,
          delta: m.delta,
          actorId: m.actorId,
          ...(occurredAt ? { occurredAt } : {}),
          supplier: m.supplier ?? null,
          note: m.note ?? null,
          reason: m.reason ?? null,
          recipientUserId: m.recipientUserId ?? null,
          recipientName: m.recipientName ?? null,
          recipientRef: m.recipientRef ?? null,
          transferId: m.transferId ?? null,
          reversesId: m.reversesId ?? null,
          returnsId: m.returnsId ?? null,
        })
        .returning({ id: consumableMovements.id })
    )[0]!;
    return row.id;
  }

  async getMovement(exec: Executor, id: string): Promise<MovementRow | undefined> {
    return (
      await exec.select().from(consumableMovements).where(eq(consumableMovements.id, id)).limit(1)
    )[0];
  }

  /** La otra pata de un traslado (misma `transfer_id`, distinto movimiento). */
  async transferSibling(exec: Executor, movement: MovementRow): Promise<MovementRow | undefined> {
    if (!movement.transferId) return undefined;
    const rows = await exec
      .select()
      .from(consumableMovements)
      .where(eq(consumableMovements.transferId, movement.transferId));
    return rows.find((r) => r.id !== movement.id);
  }

  /**
   * Serializa lo que toca a una entrega (devolverla, anular la entrega o anular una devolución). Es un candado de
   * aviso (advisory) porque la app no tiene `UPDATE` sobre el libro y `FOR UPDATE` lo exige. Se toma antes que el
   * consumible y los saldos, siempre en ese orden, para no cruzarse con otros movimientos.
   */
  async lockDelivery(exec: Executor, deliveryId: string): Promise<void> {
    await exec.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${deliveryId}::text, 0))`);
  }

  /** Suma de las devoluciones vigentes (no anuladas) de una entrega. */
  async returnedOf(exec: Executor, deliveryId: string): Promise<string> {
    const res = await exec.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(r.delta), 0) AS total FROM consumable_movements r
      WHERE r.returns_id = ${deliveryId}
        AND NOT EXISTS (SELECT 1 FROM consumable_movements x WHERE x.reverses_id = r.id)`);
    return res.rows[0]!.total;
  }

  /** Id de la anulación de un movimiento, si existe. */
  async reversalOf(exec: Executor, id: string): Promise<string | undefined> {
    return (
      await exec
        .select({ id: consumableMovements.id })
        .from(consumableMovements)
        .where(eq(consumableMovements.reversesId, id))
        .limit(1)
    )[0]?.id;
  }

  /** Historial de un consumible, el más reciente primero. Con ids, trae esos movimientos (sin paginar). */
  async listMovements(
    exec: Executor,
    consumableId: string,
    f: MovementFilters & { timezone: string; limit: number; offset: number; ids?: string[] },
  ): Promise<{ rows: MovementViewRow[]; total: number }> {
    const conds: SQL[] = [sql`m.consumable_id = ${consumableId}`];
    if (f.ids)
      conds.push(
        sql`m.id IN (${sql.join(
          f.ids.map((i) => sql`${i}`),
          sql`, `,
        )})`,
      );
    if (f.locationId) conds.push(sql`m.location_id = ${f.locationId}`);
    if (f.kind) conds.push(sql`m.kind = ${f.kind}`);
    if (f.from)
      conds.push(sql`(m.occurred_at AT TIME ZONE ${f.timezone})::date >= ${f.from}::date`);
    if (f.to) conds.push(sql`(m.occurred_at AT TIME ZONE ${f.timezone})::date <= ${f.to}::date`);
    const res = await exec.execute<
      Omit<
        MovementViewRow,
        'occurredAt' | 'createdAt' | 'reversedAt' | 'reversesAt' | 'returnsAt'
      > & {
        occurredAt: Date | string;
        createdAt: Date | string;
        reversedAt: Date | string | null;
        reversesAt: Date | string | null;
        returnsAt: Date | string | null;
        rowTotal: string;
      }
    >(sql`
      SELECT m.id, m.kind, m.location_id AS "locationId", m.delta, m.occurred_at AS "occurredAt",
             m.created_at AS "createdAt",
             (m.occurred_at AT TIME ZONE ${f.timezone})::date <> (m.created_at AT TIME ZONE ${f.timezone})::date AS backdated,
             m.actor_id AS "actorId", m.supplier, m.note, m.reason,
             m.recipient_user_id AS "recipientUserId", m.recipient_name AS "recipientName",
             m.recipient_ref AS "recipientRef", m.transfer_id AS "transferId",
             cp.location_id AS "counterpartLocationId",
             rb.id AS "reversedById", rb.occurred_at AS "reversedAt", rb.actor_id AS "reversedByActorId",
             m.reverses_id AS "reversesId", orig.kind AS "reversesKind", orig.occurred_at AS "reversesAt",
             CASE WHEN m.kind = 'delivery' THEN COALESCE((
               SELECT SUM(r.delta) FROM consumable_movements r
               WHERE r.returns_id = m.id
                 AND NOT EXISTS (SELECT 1 FROM consumable_movements x WHERE x.reverses_id = r.id)), 0) END AS "returned",
             m.returns_id AS "returnsId", ro.occurred_at AS "returnsAt",
             count(*) OVER () AS "rowTotal"
      FROM consumable_movements m
      LEFT JOIN consumable_movements cp ON m.transfer_id IS NOT NULL AND cp.transfer_id = m.transfer_id AND cp.id <> m.id
      LEFT JOIN consumable_movements rb ON rb.reverses_id = m.id
      LEFT JOIN consumable_movements orig ON orig.id = m.reverses_id
      LEFT JOIN consumable_movements ro ON ro.id = m.returns_id
      WHERE ${sql.join(conds, sql` AND `)}
      ORDER BY m.occurred_at DESC, m.id DESC
      LIMIT ${f.limit} OFFSET ${f.offset}`);
    const first = res.rows[0];
    return {
      rows: res.rows.map((r) => ({
        ...r,
        occurredAt: new Date(r.occurredAt),
        createdAt: new Date(r.createdAt),
        reversedAt: toDate(r.reversedAt),
        reversesAt: toDate(r.reversesAt),
        returnsAt: toDate(r.returnsAt),
      })),
      total: first ? Number(first.rowTotal) : 0,
    };
  }

  // --- Cuadratura (D2) ---

  /** Saldos que no son iguales a la suma del libro, en cualquiera de los dos sentidos. */
  async ledgerMismatches(exec: Executor): Promise<LedgerMismatch[]> {
    const res = await exec.execute<LedgerMismatch>(sql`
      SELECT COALESCE(s.consumable_id, l.consumable_id) AS "consumableId",
             COALESCE(s.location_id, l.location_id) AS "locationId",
             COALESCE(s.quantity, 0) AS stock, COALESCE(l.total, 0) AS ledger
      FROM consumable_stock s
      FULL JOIN (SELECT consumable_id, location_id, SUM(delta) AS total
                 FROM consumable_movements GROUP BY consumable_id, location_id) l
        ON l.consumable_id = s.consumable_id AND l.location_id = s.location_id
      WHERE COALESCE(s.quantity, 0) <> COALESCE(l.total, 0)
      ORDER BY 1, 2`);
    return res.rows;
  }
}
