import { and, count, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Executor } from '../../core/db/executor.js';
import { users } from '../../core/db/schema.js';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithSecret extends UserRow {
  passwordHash: string;
}

const publicColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  active: users.active,
  mustChangePassword: users.mustChangePassword,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

/** Acceso a la tabla `users`. Las consultas «públicas» nunca traen el hash de contraseña. */
export class UsersRepository {
  async getById(exec: Executor, id: string): Promise<UserRow | undefined> {
    return (await exec.select(publicColumns).from(users).where(eq(users.id, id)).limit(1))[0];
  }

  async getWithSecretById(exec: Executor, id: string): Promise<UserWithSecret | undefined> {
    return (await exec.select().from(users).where(eq(users.id, id)).limit(1))[0];
  }

  async getWithSecretByEmail(exec: Executor, email: string): Promise<UserWithSecret | undefined> {
    return (await exec.select().from(users).where(eq(users.email, email)).limit(1))[0];
  }

  async list(
    exec: Executor,
    opts: { q?: string | undefined; limit: number; offset: number },
  ): Promise<{ rows: UserRow[]; total: number }> {
    const term = opts.q?.trim();
    const where = term
      ? or(ilike(users.name, `%${escapeLike(term)}%`), ilike(users.email, `%${escapeLike(term)}%`))
      : undefined;
    const [rows, totals] = await Promise.all([
      exec
        .select(publicColumns)
        .from(users)
        .where(where)
        .orderBy(users.name, users.id)
        .limit(opts.limit)
        .offset(opts.offset),
      exec.select({ n: count() }).from(users).where(where),
    ]);
    return { rows, total: totals[0]?.n ?? 0 };
  }

  async insert(
    exec: Executor,
    v: { email: string; name: string; passwordHash: string; mustChangePassword: boolean },
  ): Promise<UserRow> {
    const rows = await exec.insert(users).values(v).returning(publicColumns);
    return rows[0]!;
  }

  async update(
    exec: Executor,
    id: string,
    v: { email?: string; name?: string; active?: boolean },
  ): Promise<UserRow> {
    const rows = await exec
      .update(users)
      .set({ ...v, updatedAt: sql`now()` })
      .where(eq(users.id, id))
      .returning(publicColumns);
    return rows[0]!;
  }

  async touch(exec: Executor, id: string): Promise<UserRow> {
    const rows = await exec
      .update(users)
      .set({ updatedAt: sql`now()` })
      .where(eq(users.id, id))
      .returning(publicColumns);
    return rows[0]!;
  }

  async setPassword(
    exec: Executor,
    id: string,
    passwordHash: string,
    mustChangePassword: boolean,
  ): Promise<void> {
    await exec
      .update(users)
      .set({ passwordHash, mustChangePassword, updatedAt: sql`now()` })
      .where(eq(users.id, id));
  }

  async countActiveAmong(exec: Executor, ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const rows = await exec
      .select({ n: count() })
      .from(users)
      .where(and(inArray(users.id, ids), eq(users.active, true)));
    return rows[0]?.n ?? 0;
  }

  async namesByIds(exec: Executor, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const rows = await exec
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}
