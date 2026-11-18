import { emailSchema, type UserDto } from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PreconditionFailedError,
  ValidationError,
} from '../../core/errors.js';
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
          entityLabel: user.name,
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
          actorLabel: 'cli',
          ip,
          action: 'user.create_initial_admin',
          entity: 'user',
          entityId: user.id,
          entityLabel: user.name,
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
      email?: string | undefined;
      name?: string | undefined;
      active?: boolean | undefined;
      roleIds?: string[] | undefined;
    },
    expectedVersion: string,
  ): Promise<UserDto> {
    if (patch.email !== undefined && actor.actorId === id) {
      throw new ForbiddenError(
        'Nadie puede editar su propio correo; pídeselo a otro administrador',
      );
    }
    try {
      return await this.applyUpdate(actor, id, patch, expectedVersion);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError('Ya existe un usuario con ese correo');
      throw e;
    }
  }

  private applyUpdate(
    actor: Actor,
    id: string,
    patch: {
      email?: string | undefined;
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
      const emailChanged = patch.email !== undefined && patch.email !== current.email;

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
      if (emailChanged || patch.name !== undefined || patch.active !== undefined) {
        row = await this.repo.update(tx, id, {
          ...(emailChanged ? { email: patch.email! } : {}),
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
      // Cambiar el correo cambia la identidad de login: las sesiones abiertas dejan de valer.
      if (emailChanged) await this.sessions.revokeAllForUser(tx, id);

      const afterRoles = (await this.rbac.rolesForUsers([id], tx)).get(id) ?? [];
      await this.audit.record(tx, {
        ...actor,
        action: patch.active === false && current.active ? 'user.deactivate' : 'user.update',
        entity: 'user',
        entityId: id,
        entityLabel: row.name,
        diff: {
          before: {
            email: current.email,
            name: current.name,
            active: current.active,
            roles: beforeRoles.map((r) => r.name),
          },
          after: {
            email: row.email,
            name: row.name,
            active: row.active,
            roles: afterRoles.map((r) => r.name),
          },
        },
      });
      return this.toDto(row, afterRoles);
    });
  }

  /**
   * Cambia el correo de un usuario desde la CLI (operación). Mismas reglas que por la API: validación, unicidad,
   * sesiones cerradas y auditoría con antes/después, con actor `cli`. A diferencia de la API no hay «no editar el
   * propio correo»: es el camino para recuperar el acceso de un administrador, incluso del único.
   */
  async changeEmailByCli(currentEmail: string, newEmail: string): Promise<UserDto> {
    const parsed = emailSchema.safeParse(newEmail);
    if (!parsed.success) throw new ValidationError('El correo nuevo no es válido');
    const next = parsed.data;
    try {
      return await this.db.transaction(async (tx) => {
        const current = await this.repo.getByEmail(tx, currentEmail.trim().toLowerCase());
        if (!current) throw new NotFoundError('No existe un usuario con ese correo');
        if (current.email === next) throw new ValidationError('El correo nuevo es igual al actual');
        const row = await this.repo.update(tx, current.id, { email: next });
        await this.sessions.revokeAllForUser(tx, current.id);
        await this.audit.record(tx, {
          actorId: null,
          actorLabel: 'cli',
          ip: null,
          action: 'user.update',
          entity: 'user',
          entityId: current.id,
          entityLabel: row.name,
          diff: { before: { email: current.email }, after: { email: row.email } },
        });
        return this.toDto(row, (await this.rbac.rolesForUsers([row.id], tx)).get(row.id) ?? []);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictError('Ya existe un usuario con ese correo');
      throw e;
    }
  }

  /** RF-04: contraseña temporal de un uso; obliga a cambiarla al entrar y cierra sus sesiones. */
  async resetPassword(actor: Actor, id: string): Promise<{ temporaryPassword: string }> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.hasher.hash(temporaryPassword);
    await this.db.transaction(async (tx) => {
      const target = await this.repo.getById(tx, id);
      if (!target) throw new NotFoundError('Usuario no encontrado');
      await this.repo.setPassword(tx, id, passwordHash, true);
      await this.sessions.revokeAllForUser(tx, id);
      await this.audit.record(tx, {
        ...actor,
        action: 'user.reset_password',
        entity: 'user',
        entityId: id,
        entityLabel: target.name,
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

  searchAssignable(q: string | undefined, limit: number) {
    return this.repo.searchActive(this.db, q, limit);
  }

  namesByIds(ids: string[]): Promise<Map<string, string>> {
    return this.repo.namesByIds(this.db, ids);
  }
}
