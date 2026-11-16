import { and, eq, lt, ne, sql } from 'drizzle-orm';
import type { Executor } from '../../core/db/executor.js';
import { loginThrottle, sessions } from '../../core/db/schema.js';

export interface SessionRow {
  id: string;
  userId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface ThrottleRow {
  key: string;
  failures: number;
  lockedUntil: Date | null;
  updatedAt: Date;
}

/** Acceso a `sessions` y `login_throttle` (tablas del módulo auth). */
export class AuthRepository {
  async insertSession(
    exec: Executor,
    row: {
      id: string;
      userId: string;
      expiresAt: Date;
      createdAt: Date;
      ip: string | null;
      userAgent: string | null;
    },
  ): Promise<void> {
    await exec.insert(sessions).values({ ...row, lastSeenAt: row.createdAt });
  }

  async findSession(exec: Executor, id: string): Promise<SessionRow | undefined> {
    const rows = await exec
      .select({
        id: sessions.id,
        userId: sessions.userId,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    return rows[0];
  }

  async touchSession(exec: Executor, id: string, at: Date): Promise<void> {
    await exec.update(sessions).set({ lastSeenAt: at }).where(eq(sessions.id, id));
  }

  async deleteSession(exec: Executor, id: string): Promise<void> {
    await exec.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteSessionsOfUser(exec: Executor, userId: string, exceptId?: string): Promise<void> {
    await exec
      .delete(sessions)
      .where(
        exceptId
          ? and(eq(sessions.userId, userId), ne(sessions.id, exceptId))
          : eq(sessions.userId, userId),
      );
  }

  async deleteExpiredSessions(exec: Executor, before: Date): Promise<void> {
    await exec.delete(sessions).where(lt(sessions.expiresAt, before));
  }

  async getThrottles(exec: Executor, keys: string[]): Promise<ThrottleRow[]> {
    const rows: ThrottleRow[] = [];
    for (const key of keys) {
      const r = await exec.select().from(loginThrottle).where(eq(loginThrottle.key, key)).limit(1);
      if (r[0]) rows.push(r[0]);
    }
    return rows;
  }

  /** Suma un fallo (atómico); si el último fue hace más que `decayBefore`, reinicia en 1. */
  async addFailure(exec: Executor, key: string, now: Date, decayBefore: Date): Promise<number> {
    const rows = await exec
      .insert(loginThrottle)
      .values({ key, failures: 1, updatedAt: now })
      .onConflictDoUpdate({
        target: loginThrottle.key,
        set: {
          failures: sql`CASE WHEN ${loginThrottle.updatedAt} < ${decayBefore} THEN 1 ELSE ${loginThrottle.failures} + 1 END`,
          updatedAt: now,
        },
      })
      .returning({ failures: loginThrottle.failures });
    return rows[0]!.failures;
  }

  async setLock(exec: Executor, key: string, until: Date): Promise<void> {
    await exec.update(loginThrottle).set({ lockedUntil: until }).where(eq(loginThrottle.key, key));
  }

  async clearThrottle(exec: Executor, key: string): Promise<void> {
    await exec.delete(loginThrottle).where(eq(loginThrottle.key, key));
  }
}
