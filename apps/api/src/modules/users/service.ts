import type { UserDto } from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import { ConflictError, NotFoundError, PreconditionFailedError } from '../../core/errors.js';
import type { Actor, ActorDirectory, AuditService } from '../audit/service.js';
import {
  assertPasswordPolicy,
  generateTemporaryPassword,
  type PasswordHasher,
} from '../auth/password.js';
import type { RbacService } from '../rbac/service.js';
import type { UserRow, UsersRepository } from './repository.js';

/** Revoca sesiones; lo implementa el módulo auth y se inyecta para no acoplar users con auth. */
export interface SessionRevoker {
  revokeAllForUser(exec: Executor, userId: string): Promise<void>;
}

const version = (u: UserRow) => u.updatedAt.toISOString();

function isUniqueViolation(e: unknown): boolean {
  const code = e as { code?: string; cause?: { code?: string } } | null;
  return code?.code === '23505' || code?.cause?.code === '23505';
}

/** Gestión de usuarios (RF-03, RF-04). Los hashes nunca salen de este módulo salvo hacia auth. */
export class UsersService implements ActorDirectory {
  constructor(
    private readonly repo: UsersRepository,
    private readonly db: Executor,
    private readonly rbac: RbacService,
    private readonly audit: AuditService,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionRevoker,
  ) {}

  private toDto(u: UserRow, roles: { id: string; name: string }[]): UserDto {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      active: u.active,
      mustChangePassword: u.mustChangePassword,
      roles,
      createdAt: u.createdAt.toISOString(),
      updatedAt: version(u),
    };
  }

  async list(opts: { q?: string | undefined; page: number; pageSize: number }) {
    const { rows, total } = await this.repo.list(this.db, {
      q: opts.q,
      limit: opts.pageSize,
      offset: (opts.page - 1) * opts.pageSize,
    });
    const roles = await this.rbac.rolesForUsers(rows.map((r) => r.id));
    return {
      data: rows.map((r) => this.toDto(r, roles.get(r.id) ?? [])),
      meta: { page: opts.page, pageSize: opts.pageSize, total },
    };
  }

  async get(id: string): Promise<UserDto> {
    const user = await this.repo.getById(this.db, id);
    if (!user) throw new NotFoundError('Usuario no encontrado');
    return this.toDto(user, (await this.rbac.rolesForUsers([id])).get(id) ?? []);
  }

  async create(
    actor: Actor,
    input: { email: string; name: string; roleIds: string[]; password: string },
  ): Promise<UserDto> {
    assertPasswordPolicy(input.password, { email: input.email });
    const passwordHash = await this.hasher.hash(input.password);
    try {
      return await this.db.transaction(async (tx) => {
        const user = await this.repo.insert(tx, {
          email: input.email,
          name: input.name,
          passwordHash,
          mustChangePassword: true,
        });
        await this.rbac.assignRoles(tx, user.id, input.roleIds);
        const roles = (await this.rbac.rolesForUsers([user.id], tx)).get(user.id) ?? [];
        await this.audit.record(tx, {
          ...actor,
          action: 'user.create',
          entity: 'user',
          entityId: user.id,
          diff: { after: { email: user.email, name: user.name, roles: roles.map((r) => r.name) } },
        });
        return this.toDto(user, roles);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError('Ya existe un usuario con ese correo');
      throw e;
    }
  }

  /** Crea el primer administrador (CLI, RF-02): sin contraseña temporal, sin actor humano. */
  async createInitialAdmin(
    input: { email: string; name: string; password: string },
    ip: string | null = null,
  ): Promise<UserDto> {
    assertPasswordPolicy(input.password, { email: input.email });
    const passwordHash = await this.hasher.hash(input.password);
    const adminRoleId = await this.rbac.adminRoleId();
    if (!adminRoleId)
      throw new NotFoundError('El rol Administrador no existe; ¿se aplicaron las migraciones?');
    try {
      return await this.db.transaction(async (tx) => {
        const user = await this.repo.insert(tx, {
          email: input.email,
          name: input.name,
          passwordHash,
          mustChangePassword: false,
        });
        await this.rbac.assignRoles(tx, user.id, [adminRoleId]);
        await this.audit.record(tx, {
          actorId: null,
          ip,
          action: 'user.create_initial_admin',
          entity: 'user',
          entityId: user.id,
          diff: { after: { email: user.email, name: user.name } },
        });
        return this.toDto(user, (await this.rbac.rolesForUsers([user.id], tx)).get(user.id) ?? []);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError('Ya existe un usuario con ese correo');
      throw e;
    }
  }

  async update(
    actor: Actor,
    id: string,
    patch: {
      name?: string | undefined;
      active?: boolean | undefined;
      roleIds?: string[] | undefined;
    },
    expectedVersion: string,
  ): Promise<UserDto> {
    return this.db.transaction(async (tx) => {
      const current = await this.repo.getById(tx, id);
      if (!current) throw new NotFoundError('Usuario no encontrado');
      if (version(current) !== expectedVersion) throw new PreconditionFailedError();

      const beforeRoles = (await this.rbac.rolesForUsers([id], tx)).get(id) ?? [];
      const adminRoleId = await this.rbac.adminRoleId(tx);
      const wasAdmin = adminRoleId ? beforeRoles.some((r) => r.id === adminRoleId) : false;
      const willBeAdmin =
        patch.roleIds && adminRoleId ? patch.roleIds.includes(adminRoleId) : wasAdmin;
      const willBeActive = patch.active ?? current.active;
      if (wasAdmin && current.active && (!willBeAdmin || !willBeActive)) {
        await this.assertAnotherActiveAdmin(tx, id);
      }

      let row = current;
      if (patch.name !== undefined || patch.active !== undefined) {
        row = await this.repo.update(tx, id, {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        });
      }
      if (patch.roleIds !== undefined) {
        await this.rbac.assignRoles(tx, id, patch.roleIds);
        row = await this.repo.touch(tx, id);
      }
      // RF-03: un usuario inactivo pierde sus sesiones al instante.
      if (patch.active === false && current.active) await this.sessions.revokeAllForUser(tx, id);

      const afterRoles = (await this.rbac.rolesForUsers([id], tx)).get(id) ?? [];
      await this.audit.record(tx, {
        ...actor,
        action: patch.active === false && current.active ? 'user.deactivate' : 'user.update',
        entity: 'user',
        entityId: id,
        diff: {
          before: {
            name: current.name,
            active: current.active,
            roles: beforeRoles.map((r) => r.name),
          },
          after: { name: row.name, active: row.active, roles: afterRoles.map((r) => r.name) },
        },
      });
      return this.toDto(row, afterRoles);
    });
  }

  /** RF-04: contraseña temporal de un uso; obliga a cambiarla al entrar y cierra sus sesiones. */
  async resetPassword(actor: Actor, id: string): Promise<{ temporaryPassword: string }> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.hasher.hash(temporaryPassword);
    await this.db.transaction(async (tx) => {
      if (!(await this.repo.getById(tx, id))) throw new NotFoundError('Usuario no encontrado');
      await this.repo.setPassword(tx, id, passwordHash, true);
      await this.sessions.revokeAllForUser(tx, id);
      await this.audit.record(tx, {
        ...actor,
        action: 'user.reset_password',
        entity: 'user',
        entityId: id,
      });
    });
    return { temporaryPassword };
  }

  private async assertAnotherActiveAdmin(tx: Executor, excludingUserId: string): Promise<void> {
    const admins = (await this.rbac.adminUserIds(tx)).filter((a) => a !== excludingUserId);
    if ((await this.repo.countActiveAmong(tx, admins)) === 0) {
      throw new ConflictError('Debe quedar al menos un administrador activo');
    }
  }

  // --- Puertos que consume el módulo auth ---

  findForLogin(email: string) {
    return this.repo.getWithSecretByEmail(this.db, email);
  }

  findSecretById(id: string, exec: Executor = this.db) {
    return this.repo.getWithSecretById(exec, id);
  }

  findById(id: string, exec: Executor = this.db) {
    return this.repo.getById(exec, id);
  }

  setPassword(exec: Executor, userId: string, passwordHash: string, mustChangePassword: boolean) {
    return this.repo.setPassword(exec, userId, passwordHash, mustChangePassword);
  }

  namesByIds(ids: string[]): Promise<Map<string, string>> {
    return this.repo.namesByIds(this.db, ids);
  }
}
