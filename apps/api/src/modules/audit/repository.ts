import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import type { Executor } from '../../core/db/executor.js';
import { auditLog } from '../../core/db/schema.js';

export interface AuditRow {
  id: bigint;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  diff: Record<string, unknown> | null;
  ip: string | null;
  at: Date;
}

export interface AuditFilters {
  actorId?: string | undefined;
  entity?: string | undefined;
  /** Con `entity`: el historial de un registro concreto (RF-24). */
  entityId?: string | undefined;
  action?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
}

export type NewAuditRow = Omit<AuditRow, 'id' | 'at'>;

/** Acceso a `audit_log`. Solo inserta y lee: la tabla es append-only también a nivel de privilegios de BD. */
export class AuditRepository {
  async insert(exec: Executor, row: NewAuditRow): Promise<void> {
    await exec.insert(auditLog).values(row);
  }
  async insertMany(exec: Executor, rows: NewAuditRow[]): Promise<void> {
    if (rows.length) await exec.insert(auditLog).values(rows);
  }

  async list(
    exec: Executor,
    filters: AuditFilters,
    page: { limit: number; offset: number },
  ): Promise<{ rows: AuditRow[]; total: number }> {
    const conds: SQL[] = [];
    if (filters.actorId) conds.push(eq(auditLog.actorId, filters.actorId));
    if (filters.entity) conds.push(eq(auditLog.entity, filters.entity));
    if (filters.entityId) conds.push(eq(auditLog.entityId, filters.entityId));
    if (filters.action) conds.push(eq(auditLog.action, filters.action));
    if (filters.from) conds.push(gte(auditLog.at, filters.from));
    if (filters.to) conds.push(lte(auditLog.at, filters.to));
    const where = conds.length ? and(...conds) : undefined;

    const [rows, totals] = await Promise.all([
      exec
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.at), desc(auditLog.id))
        .limit(page.limit)
        .offset(page.offset),
      exec.select({ n: count() }).from(auditLog).where(where),
    ]);
    return { rows, total: totals[0]?.n ?? 0 };
  }
}
