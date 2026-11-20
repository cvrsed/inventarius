import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../../core/db/executor.js';
import { lnsProfiles, lnsRegistrations } from '../../core/db/schema.js';

export interface RegistrationRow {
  id: string;
  assetId: string;
  profileId: string;
  profileName: string;
  profileKind: string;
  status: string;
  externalId: string | null;
  origin: string;
  stepsDone: string[];
  orphans: string[];
  lastOperation: string;
  lastError: string | null;
  attempts: number;
  requestedBy: string | null;
  registeredAt: Date | null;
  remoteSnapshot: (typeof lnsRegistrations.$inferSelect)['remoteSnapshot'];
  updatedAt: Date;
}

export type RegistrationChanges = Partial<
  Pick<
    typeof lnsRegistrations.$inferInsert,
    | 'profileId'
    | 'status'
    | 'externalId'
    | 'origin'
    | 'stepsDone'
    | 'orphans'
    | 'lastOperation'
    | 'lastError'
    | 'attempts'
    | 'requestedBy'
    | 'registeredAt'
    | 'remoteSnapshot'
  >
>;

/** Persistencia de los registros de activos en un LNS (RF-61, RF-65). */
export class RegistrationsRepository {
  private select(exec: Executor) {
    return exec
      .select({
        id: lnsRegistrations.id,
        assetId: lnsRegistrations.assetId,
        profileId: lnsRegistrations.profileId,
        profileName: lnsProfiles.name,
        profileKind: lnsProfiles.kind,
        status: lnsRegistrations.status,
        externalId: lnsRegistrations.externalId,
        origin: lnsRegistrations.origin,
        stepsDone: lnsRegistrations.stepsDone,
        orphans: lnsRegistrations.orphans,
        lastOperation: lnsRegistrations.lastOperation,
        lastError: lnsRegistrations.lastError,
        attempts: lnsRegistrations.attempts,
        requestedBy: lnsRegistrations.requestedBy,
        registeredAt: lnsRegistrations.registeredAt,
        remoteSnapshot: lnsRegistrations.remoteSnapshot,
        updatedAt: lnsRegistrations.updatedAt,
      })
      .from(lnsRegistrations)
      .innerJoin(lnsProfiles, eq(lnsProfiles.id, lnsRegistrations.profileId));
  }

  async getByAsset(exec: Executor, assetId: string): Promise<RegistrationRow | undefined> {
    return (await this.select(exec).where(eq(lnsRegistrations.assetId, assetId)).limit(1))[0];
  }

  async getById(exec: Executor, id: string): Promise<RegistrationRow | undefined> {
    return (await this.select(exec).where(eq(lnsRegistrations.id, id)).limit(1))[0];
  }

  async insert(
    exec: Executor,
    values: { assetId: string; profileId: string; requestedBy: string | null },
  ): Promise<string> {
    const [row] = await exec
      .insert(lnsRegistrations)
      .values({ ...values, status: 'registering' })
      .returning({ id: lnsRegistrations.id });
    return row!.id;
  }

  async update(exec: Executor, id: string, changes: RegistrationChanges): Promise<void> {
    await exec
      .update(lnsRegistrations)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(eq(lnsRegistrations.id, id));
  }

  async remove(exec: Executor, id: string): Promise<void> {
    await exec.delete(lnsRegistrations).where(eq(lnsRegistrations.id, id));
  }

  /** Bloquea el registro del activo (si existe) hasta el fin de la transacción. */
  async lockByAsset(exec: Executor, assetId: string): Promise<void> {
    await exec
      .select({ id: lnsRegistrations.id })
      .from(lnsRegistrations)
      .where(eq(lnsRegistrations.assetId, assetId))
      .for('update');
  }
}
