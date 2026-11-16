import type { Executor } from '../../core/db/executor.js';
import { changedFields } from '../../core/diff.js';
import { ConflictError, NotFoundError, PreconditionFailedError } from '../../core/errors.js';
import type { Actor, AuditService } from '../audit/service.js';

export interface Versioned {
  id: string;
  updatedAt: Date;
}

/** Quita las claves `undefined` (los esquemas parciales de Zod las dejan) antes de llegar al SQL. */
export function compact<T extends object>(value: T): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };
}

export function isViolation(e: unknown, code: string): boolean {
  const err = e as { code?: string; cause?: { code?: string } } | null;
  return err?.code === code || err?.cause?.code === code;
}

/** Cómo se comporta una entidad del catálogo: persistencia, reglas propias y mensajes. */
export interface EntityDef<Row extends Versioned, Dto, Create, Patch, Query> {
  /** Nombre de la entidad en auditoría (`category`, `status_label`...). */
  entity: string;
  notFound: string;
  duplicate: string;
  toDto(row: Row): Dto;
  /** Campos que van a auditoría; nunca secretos. */
  snapshot(row: Row): Record<string, unknown>;
  list(exec: Executor, query: Query): Promise<{ rows: Row[]; total: number }>;
  get(exec: Executor, id: string): Promise<Row | undefined>;
  insert(exec: Executor, input: Create): Promise<Row>;
  update(exec: Executor, id: string, patch: Patch): Promise<Row>;
  remove(exec: Executor, id: string): Promise<void>;
  inUse(exec: Executor, id: string): Promise<boolean>;
  beforeCreate?(tx: Executor, input: Create): Promise<Create>;
  beforeUpdate?(tx: Executor, current: Row, patch: Patch): Promise<Patch>;
  beforeDelete?(tx: Executor, row: Row): void;
}

const IN_USE = 'No se puede borrar porque está en uso. Desactívalo para que ya no se pueda elegir.';

/**
 * CRUD genérico de una entidad del catálogo con las reglas comunes: versión optimista (`If-Match`),
 * unicidad, «no se borra lo que está en uso» (RF-14) y auditoría dentro de la misma transacción (RF-30).
 */
export class CatalogEntity<
  Row extends Versioned,
  Dto,
  Create,
  Patch,
  Query extends { page: number; pageSize: number },
> {
  constructor(
    private readonly def: EntityDef<Row, Dto, Create, Patch, Query>,
    private readonly db: Executor,
    private readonly audit: AuditService,
  ) {}

  async list(query: Query) {
    const { rows, total } = await this.def.list(this.db, query);
    return {
      data: rows.map((r) => this.def.toDto(r)),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string): Promise<Dto> {
    const row = await this.def.get(this.db, id);
    if (!row) throw new NotFoundError(this.def.notFound);
    return this.def.toDto(row);
  }

  /** Fila cruda para otros servicios (validar referencias). */
  find(id: string, exec: Executor = this.db): Promise<Row | undefined> {
    return this.def.get(exec, id);
  }

  async create(actor: Actor, input: Create): Promise<Dto> {
    try {
      return await this.db.transaction(async (tx) => {
        const prepared = this.def.beforeCreate ? await this.def.beforeCreate(tx, input) : input;
        const row = await this.def.insert(tx, prepared);
        await this.audit.record(tx, {
          ...actor,
          action: `${this.def.entity}.create`,
          entity: this.def.entity,
          entityId: row.id,
          diff: { after: this.def.snapshot(row) },
        });
        return this.def.toDto(row);
      });
    } catch (e) {
      if (isViolation(e, '23505')) throw new ConflictError(this.def.duplicate);
      throw e;
    }
  }

  async update(actor: Actor, id: string, patch: Patch, expectedVersion: string): Promise<Dto> {
    try {
      return await this.db.transaction(async (tx) => {
        const current = await this.def.get(tx, id);
        if (!current) throw new NotFoundError(this.def.notFound);
        if (current.updatedAt.toISOString() !== expectedVersion)
          throw new PreconditionFailedError();
        const prepared = this.def.beforeUpdate
          ? await this.def.beforeUpdate(tx, current, patch)
          : patch;
        const row = await this.def.update(tx, id, prepared);
        const diff = changedFields(this.def.snapshot(current), this.def.snapshot(row));
        if (diff) {
          await this.audit.record(tx, {
            ...actor,
            action: `${this.def.entity}.update`,
            entity: this.def.entity,
            entityId: id,
            diff,
          });
        }
        return this.def.toDto(row);
      });
    } catch (e) {
      if (isViolation(e, '23505')) throw new ConflictError(this.def.duplicate);
      throw e;
    }
  }

  async remove(actor: Actor, id: string): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const current = await this.def.get(tx, id);
        if (!current) throw new NotFoundError(this.def.notFound);
        this.def.beforeDelete?.(tx, current);
        if (await this.def.inUse(tx, id)) throw new ConflictError(IN_USE);
        await this.def.remove(tx, id);
        await this.audit.record(tx, {
          ...actor,
          action: `${this.def.entity}.delete`,
          entity: this.def.entity,
          entityId: id,
          diff: { before: this.def.snapshot(current) },
        });
      });
    } catch (e) {
      // Respaldo de las FK `restrict` si algo apareció entre la revisión y el borrado.
      if (isViolation(e, '23503')) throw new ConflictError(IN_USE);
      throw e;
    }
  }
}
