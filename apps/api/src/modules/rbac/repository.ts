import { count, eq, inArray, sql } from 'drizzle-orm';
import type { Executor } from '../../core/db/executor.js';
import { rolePermissions, roles, userRoles } from '../../core/db/schema.js';

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  isProtected: boolean;
  updatedAt: Date;
}

/** Acceso a roles, permisos y asignaciones usuario-rol (tablas del módulo rbac). */
export class RbacRepository {
  listRoles(exec: Executor): Promise<RoleRow[]> {
    return exec.select().from(roles).orderBy(roles.name);
  }

  async getRole(exec: Executor, id: string): Promise<RoleRow | undefined> {
    const rows = await exec.select().from(roles).where(eq(roles.id, id)).limit(1);
    return rows[0];
  }

  async findRoleByName(exec: Executor, name: string): Promise<RoleRow | undefined> {
    const rows = await exec.select().from(roles).where(eq(roles.name, name)).limit(1);
    return rows[0];
  }

  async permissionsByRole(exec: Executor, roleIds?: string[]): Promise<Map<string, string[]>> {
    const rows = await (roleIds
      ? exec.select().from(rolePermissions).where(inArray(rolePermissions.roleId, roleIds))
      : exec.select().from(rolePermissions));
    const map = new Map<string, string[]>();
    for (const r of rows) map.set(r.roleId, [...(map.get(r.roleId) ?? []), r.permission]);
    return map;
  }

  async userCountsByRole(exec: Executor): Promise<Map<string, number>> {
    const rows = await exec
      .select({ roleId: userRoles.roleId, n: count() })
      .from(userRoles)
      .groupBy(userRoles.roleId);
    return new Map(rows.map((r) => [r.roleId, r.n]));
  }

  async insertRole(
    exec: Executor,
    values: { name: string; description: string },
  ): Promise<RoleRow> {
    const rows = await exec.insert(roles).values(values).returning();
    return rows[0]!;
  }

  async updateRole(
    exec: Executor,
    id: string,
    values: { name?: string; description?: string },
  ): Promise<RoleRow> {
    const rows = await exec
      .update(roles)
      .set({ ...values, updatedAt: sql`now()` })
      .where(eq(roles.id, id))
      .returning();
    return rows[0]!;
  }

  async deleteRole(exec: Executor, id: string): Promise<void> {
    await exec.delete(roles).where(eq(roles.id, id));
  }

  async replaceRolePermissions(
    exec: Executor,
    roleId: string,
    permissions: string[],
  ): Promise<void> {
    await exec.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissions.length) {
      await exec
        .insert(rolePermissions)
        .values(permissions.map((permission) => ({ roleId, permission })));
    }
  }

  async touchRole(exec: Executor, id: string): Promise<RoleRow> {
    const rows = await exec
      .update(roles)
      .set({ updatedAt: sql`now()` })
      .where(eq(roles.id, id))
      .returning();
    return rows[0]!;
  }

  async existingRoleIds(exec: Executor, ids: string[]): Promise<Set<string>> {
    if (!ids.length) return new Set();
    const rows = await exec.select({ id: roles.id }).from(roles).where(inArray(roles.id, ids));
    return new Set(rows.map((r) => r.id));
  }

  async rolesForUsers(
    exec: Executor,
    userIds: string[],
  ): Promise<Map<string, { id: string; name: string }[]>> {
    const map = new Map<string, { id: string; name: string }[]>();
    if (!userIds.length) return map;
    const rows = await exec
      .select({ userId: userRoles.userId, id: roles.id, name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, userIds))
      .orderBy(roles.name);
    for (const r of rows)
      map.set(r.userId, [...(map.get(r.userId) ?? []), { id: r.id, name: r.name }]);
    return map;
  }

  async setUserRoles(exec: Executor, userId: string, roleIds: string[]): Promise<void> {
    await exec.delete(userRoles).where(eq(userRoles.userId, userId));
    if (roleIds.length)
      await exec.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId })));
  }

  async userIdsWithRole(exec: Executor, roleId: string): Promise<string[]> {
    const rows = await exec
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, roleId));
    return rows.map((r) => r.userId);
  }

  async permissionsForUser(exec: Executor, userId: string): Promise<string[]> {
    const rows = await exec
      .selectDistinct({ permission: rolePermissions.permission })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .where(eq(userRoles.userId, userId))
      .orderBy(rolePermissions.permission);
    return rows.map((r) => r.permission);
  }
}
