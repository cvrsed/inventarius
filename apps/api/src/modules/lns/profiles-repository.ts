import { and, count, desc, eq, ilike, sql } from 'drizzle-orm';
import type { Executor } from '../../core/db/executor.js';
import { lnsProfiles } from '../../core/db/schema.js';

export type LnsProfileRow = typeof lnsProfiles.$inferSelect & { registeredDevices: number };
export type NewLnsProfile = typeof lnsProfiles.$inferInsert;
export type LnsProfileChanges = Partial<
  Pick<
    NewLnsProfile,
    | 'name'
    | 'description'
    | 'active'
    | 'endpoint'
    | 'tls'
    | 'credentialEnc'
    | 'credentialHint'
    | 'keyId'
    | 'target'
    | 'deviceDefaults'
  >
>;

/** Cuenta con la tabla escrita a mano: Drizzle no califica `id` dentro de la subconsulta y se confundiría. */
const registeredDevices = sql<number>`(SELECT count(*)::int FROM lns_registrations r WHERE r.profile_id = lns_profiles.id)`;

/** Persistencia de perfiles LNS (RF-50). */
export class LnsProfilesRepository {
  private select(exec: Executor) {
    return exec.select({ ...lnsProfilesColumns(), registeredDevices }).from(lnsProfiles);
  }

  async list(
    exec: Executor,
    q: { q?: string | undefined; activeOnly?: boolean },
    page: { limit: number; offset: number },
  ): Promise<{ rows: LnsProfileRow[]; total: number }> {
    const where = and(
      q.q ? ilike(lnsProfiles.name, `%${q.q.replace(/[%_\\]/g, '\\$&')}%`) : undefined,
      q.activeOnly ? eq(lnsProfiles.active, true) : undefined,
    );
    const [rows, totals] = await Promise.all([
      this.select(exec)
        .where(where)
        .orderBy(desc(lnsProfiles.active), lnsProfiles.name)
        .limit(page.limit)
        .offset(page.offset),
      exec.select({ n: count() }).from(lnsProfiles).where(where),
    ]);
    return { rows, total: totals[0]?.n ?? 0 };
  }

  async get(exec: Executor, id: string): Promise<LnsProfileRow | undefined> {
    return (await this.select(exec).where(eq(lnsProfiles.id, id)).limit(1))[0];
  }

  async insert(exec: Executor, values: NewLnsProfile): Promise<void> {
    await exec.insert(lnsProfiles).values(values);
  }

  async update(exec: Executor, id: string, changes: LnsProfileChanges): Promise<void> {
    await exec
      .update(lnsProfiles)
      .set({ ...changes, updatedAt: sql`now()` })
      .where(eq(lnsProfiles.id, id));
  }

  async remove(exec: Executor, id: string): Promise<void> {
    await exec.delete(lnsProfiles).where(eq(lnsProfiles.id, id));
  }

  /** Bloquea el perfil hasta el fin de la transacción. */
  async lock(exec: Executor, id: string): Promise<boolean> {
    return (
      (
        await exec
          .select({ id: lnsProfiles.id })
          .from(lnsProfiles)
          .where(eq(lnsProfiles.id, id))
          .for('update')
      ).length > 0
    );
  }
}

function lnsProfilesColumns() {
  return {
    id: lnsProfiles.id,
    kind: lnsProfiles.kind,
    name: lnsProfiles.name,
    description: lnsProfiles.description,
    endpoint: lnsProfiles.endpoint,
    tls: lnsProfiles.tls,
    credentialEnc: lnsProfiles.credentialEnc,
    credentialHint: lnsProfiles.credentialHint,
    keyId: lnsProfiles.keyId,
    target: lnsProfiles.target,
    deviceDefaults: lnsProfiles.deviceDefaults,
    active: lnsProfiles.active,
    createdAt: lnsProfiles.createdAt,
    updatedAt: lnsProfiles.updatedAt,
  };
}
