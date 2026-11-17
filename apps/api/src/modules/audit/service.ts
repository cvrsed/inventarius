import type { AuditAction, AuditEntity, AuditEntryDto } from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import type { AuditFilters, AuditRepository } from './repository.js';

/** Quién y desde dónde hace la operación; lo arma la capa HTTP y viaja a los servicios. */
export interface Actor {
  actorId: string | null;
  ip: string | null;
}

export interface AuditEntryInput extends Actor {
  /** Quién actuó cuando no hay usuario (`cli`). Se ignora si hay `actorId`. */
  actorLabel?: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | null;
  /** Antes/después de los campos que cambiaron. Nunca incluir secretos ni hashes. */
  diff?: Record<string, unknown> | null;
}

/** Resuelve nombres de actores sin que auditoría lea la tabla de usuarios. */
export interface ActorDirectory {
  namesByIds(ids: string[]): Promise<Map<string, string>>;
}

/** Servicio de auditoría (RF-30, RF-31). */
export class AuditService {
  constructor(
    private readonly repo: AuditRepository,
    private readonly db: Executor,
    private readonly actors: ActorDirectory,
  ) {}

  /**
   * Registra una entrada. Se llama con el mismo `exec` (transacción) que hace el cambio,
   * así el cambio y su rastro se confirman o se revierten juntos.
   */
  async record(exec: Executor, entry: AuditEntryInput): Promise<void> {
    await this.repo.insert(exec, {
      actorId: entry.actorId,
      actorLabel: entry.actorId ? null : (entry.actorLabel ?? null),
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      diff: entry.diff ?? null,
      ip: entry.ip,
    });
  }

  /** Registra varias entradas con una sola inserción (altas en lote). */
  async recordMany(exec: Executor, entries: AuditEntryInput[]): Promise<void> {
    await this.repo.insertMany(
      exec,
      entries.map((entry) => ({
        actorId: entry.actorId,
        actorLabel: entry.actorId ? null : (entry.actorLabel ?? null),
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        diff: entry.diff ?? null,
        ip: entry.ip,
      })),
    );
  }

  /** Lista paginada y filtrable, la más reciente primero. */
  async list(
    filters: AuditFilters,
    page: { page: number; pageSize: number },
  ): Promise<{ data: AuditEntryDto[]; meta: { page: number; pageSize: number; total: number } }> {
    const { rows, total } = await this.repo.list(this.db, filters, {
      limit: page.pageSize,
      offset: (page.page - 1) * page.pageSize,
    });
    const names = await this.actors.namesByIds([
      ...new Set(rows.flatMap((r) => (r.actorId ? [r.actorId] : []))),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id.toString(),
        at: r.at.toISOString(),
        actorId: r.actorId,
        actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
        actorLabel: r.actorLabel,
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        diff: r.diff,
        ip: r.ip,
      })),
      meta: { page: page.page, pageSize: page.pageSize, total },
    };
  }
}
