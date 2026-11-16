import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { permissionSchema, roleSchema, type Permission, type RoleDto } from '@inventarius/shared';
import { z } from 'zod';
import { api } from '@/shared/api/http';

export function useRoles() {
  return useQuery({
    queryKey: ['roles'] as const,
    queryFn: () => api('/api/v1/roles', z.array(roleSchema)),
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ['permissions'] as const,
    queryFn: () => api('/api/v1/permissions', z.array(permissionSchema)),
    staleTime: Infinity,
  });
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: Permission[];
}

export function useRoleMutations() {
  const qc = useQueryClient();
  // Cambiar roles cambia lo que muestran usuarios y la sesión: se invalida todo lo relacionado.
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['roles'] }),
      qc.invalidateQueries({ queryKey: ['users'] }),
    ]);
  return {
    create: useMutation({
      mutationFn: (input: RoleInput) =>
        api('/api/v1/roles', roleSchema, { method: 'POST', body: input }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { role: RoleDto; patch: Partial<RoleInput> }) =>
        api(`/api/v1/roles/${v.role.id}`, roleSchema, {
          method: 'PATCH',
          body: v.patch,
          ifMatch: v.role.updatedAt,
        }),
      onSuccess: refresh,
      onError: refresh,
    }),
    remove: useMutation({
      mutationFn: (role: RoleDto) =>
        api(`/api/v1/roles/${role.id}`, z.null(), { method: 'DELETE' }),
      onSuccess: refresh,
    }),
  };
}
