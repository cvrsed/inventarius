import { ADMIN_ROLE_NAME, PERMISSIONS, type Permission, type RoleDto } from '@inventarius/shared';
import type { Executor } from '../../core/db/executor.js';
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ValidationError,
} from '../../core/errors.js';
import type { Actor, AuditService } from '../audit/service.js';
import type { RbacRepository, RoleRow } from './repository.js';

/** Convierte un `updatedAt` en el ETag que el cliente devuelve en `If-Match`. */
export function versionOf(updatedAt: Date): string {
  return updatedAt.toISOString();
}

/** Reglas de roles y permisos. El administrador es el único rol con matriz fija. */
export class RbacService {
  constructor(
    private readonly repo: RbacRepository,
    private readonly db: Executor,
    private readonly audit: AuditService,
  ) {}

  private async toDto(exec: Executor, rows: RoleRow[]): Promise<RoleDto[]> {
    const [perms, counts] = await Promise.all([
      this.repo.permissionsByRole(
        exec,
        rows.map((r) => r.id),
      ),
      this.repo.userCountsByRole(exec),
    ]);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isProtected: r.isProtected,
      permissions: (perms.get(r.id) ?? [])
        .filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p))
        .sort(),
      userCount: counts.get(r.id) ?? 0,
      updatedAt: versionOf(r.updatedAt),
    }));
  }

  async listRoles(): Promise<RoleDto[]> {
    return this.toDto(this.db, await this.repo.listRoles(this.db));
  }

  async getRole(id: string): Promise<RoleDto> {
    const row = await this.repo.getRole(this.db, id);
    if (!row) throw new NotFoundError('Rol no encontrado');
    return (await this.toDto(this.db, [row]))[0]!;
  }

  /** Catálogo fijo de permisos (solo lectura). */
  listPermissions(): readonly Permission[] {
    return PERMISSIONS;
  }

  async createRole(
    actor: Actor,
    input: { name: string; description: string; permissions: Permission[] },
  ): Promise<RoleDto> {
    return this.db.transaction(async (tx) => {
      if (await this.repo.findRoleByName(tx, input.name))
        throw new ConflictError('Ya existe un rol con ese nombre');
      const role = await this.repo.insertRole(tx, {
        name: input.name,
        description: input.description,
      });
      await this.repo.replaceRolePermissions(tx, role.id, [...new Set(input.permissions)]);
      await this.audit.record(tx, {
        ...actor,
        action: 'role.create',
        entity: 'role',
        entityId: role.id,
        diff: { after: { name: input.name, permissions: [...new Set(input.permissions)].sort() } },
      });
      return (await this.toDto(tx, [role]))[0]!;
    });
  }

  async updateRole(
    actor: Actor,
    id: string,
    patch: {
      name?: string | undefined;
      description?: string | undefined;
      permissions?: Permission[] | undefined;
    },
    expectedVersion: string,
  ): Promise<RoleDto> {
    return this.db.transaction(async (tx) => {
      const current = await this.repo.getRole(tx, id);
      if (!current) throw new NotFoundError('Rol no encontrado');
      if (versionOf(current.updatedAt) !== expectedVersion) throw new PreconditionFailedError();

      if (
        current.isProtected &&
        (patch.permissions !== undefined ||
          (patch.name !== undefined && patch.name !== current.name))
      ) {
        throw new ValidationError(
          'El rol Administrador no se puede renombrar ni cambiar sus permisos',
        );
      }
      if (patch.name !== undefined && patch.name !== current.name) {
        if (current.isSystem) throw new ValidationError('Los roles semilla no se pueden renombrar');
        if (await this.repo.findRoleByName(tx, patch.name))
          throw new ConflictError('Ya existe un rol con ese nombre');
      }

      const before = (await this.toDto(tx, [current]))[0]!;
      let row = current;
      if (patch.name !== undefined || patch.description !== undefined) {
        row = await this.repo.updateRole(tx, id, {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
        });
      }
      if (patch.permissions !== undefined) {
        await this.repo.replaceRolePermissions(tx, id, [...new Set(patch.permissions)]);
        row = await this.repo.touchRole(tx, id);
      }
      const after = (await this.toDto(tx, [row]))[0]!;
      await this.audit.record(tx, {
        ...actor,
        action: 'role.update',
        entity: 'role',
        entityId: id,
        diff: {
          before: {
            name: before.name,
            description: before.description,
            permissions: before.permissions,
          },
          after: {
            name: after.name,
            description: after.description,
            permissions: after.permissions,
          },
        },
      });
      return after;
    });
  }

  async deleteRole(actor: Actor, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const role = await this.repo.getRole(tx, id);
      if (!role) throw new NotFoundError('Rol no encontrado');
      if (role.isSystem) throw new ConflictError('Los roles semilla no se pueden borrar');
      const assigned = await this.repo.userIdsWithRole(tx, id);
      if (assigned.length)
        throw new ConflictError('El rol tiene usuarios asignados; reasígnalos antes de borrarlo');
      await this.repo.deleteRole(tx, id);
      await this.audit.record(tx, {
        ...actor,
        action: 'role.delete',
        entity: 'role',
        entityId: id,
        diff: { before: { name: role.name } },
      });
    });
  }

  // --- API que consumen otros módulos (users, auth) ---

  async rolesForUsers(
    userIds: string[],
    exec: Executor = this.db,
  ): Promise<Map<string, { id: string; name: string }[]>> {
    return this.repo.rolesForUsers(exec, userIds);
  }

  /** Reemplaza los roles de un usuario; valida que todos existan. */
  async assignRoles(exec: Executor, userId: string, roleIds: string[]): Promise<void> {
    const unique = [...new Set(roleIds)];
    const existing = await this.repo.existingRoleIds(exec, unique);
    const missing = unique.filter((r) => !existing.has(r));
    if (missing.length)
      throw new ValidationError('Algún rol indicado no existe', { roleIds: ['Rol inexistente'] });
    await this.repo.setUserRoles(exec, userId, unique);
  }

  /** Ids de usuarios con el rol Administrador (para la regla de «al menos un administrador activo»). */
  async adminUserIds(exec: Executor = this.db): Promise<string[]> {
    const admin = await this.repo.findRoleByName(exec, ADMIN_ROLE_NAME);
    return admin ? this.repo.userIdsWithRole(exec, admin.id) : [];
  }

  async adminRoleId(exec: Executor = this.db): Promise<string | undefined> {
    return (await this.repo.findRoleByName(exec, ADMIN_ROLE_NAME))?.id;
  }

  async permissionsForUser(userId: string, exec: Executor = this.db): Promise<Permission[]> {
    const perms = await this.repo.permissionsForUser(exec, userId);
    return perms.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p));
  }
}
