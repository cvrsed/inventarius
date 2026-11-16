import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import {
  pageOf,
  resetPasswordResponseSchema,
  roleSchema,
  userSchema,
  type UserDto,
} from '@inventarius/shared';
import { computed, type Ref } from 'vue';
import { z } from 'zod';
import { api } from '@/shared/api/http';

const usersPage = pageOf(userSchema);

export interface UsersQuery {
  page: number;
  pageSize: number;
  q: string;
}

export function useUsersList(params: Ref<UsersQuery>) {
  return useQuery({
    queryKey: computed(() => ['users', params.value] as const),
    queryFn: ({ signal }) => {
      const { page, pageSize, q } = params.value;
      const qs = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        ...(q ? { q } : {}),
      });
      return api(`/api/v1/users?${qs}`, usersPage, { signal });
    },
    placeholderData: keepPreviousData,
  });
}

/** Roles disponibles para asignar (los ve quien gestiona usuarios o roles). */
export function useRolesQuery() {
  return useQuery({
    queryKey: ['roles'] as const,
    queryFn: () => api('/api/v1/roles', z.array(roleSchema)),
  });
}

export interface CreateUserInput {
  email: string;
  name: string;
  roleIds: string[];
  password: string;
}

export interface UpdateUserInput {
  email?: string;
  name?: string;
  active?: boolean;
  roleIds?: string[];
}

export function useUserMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  return {
    create: useMutation({
      mutationFn: (input: CreateUserInput) =>
        api('/api/v1/users', userSchema, { method: 'POST', body: input }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: (v: { user: UserDto; patch: UpdateUserInput }) =>
        api(`/api/v1/users/${v.user.id}`, userSchema, {
          method: 'PATCH',
          body: v.patch,
          ifMatch: v.user.updatedAt,
        }),
      onSuccess: refresh,
      // 412: alguien más cambió el registro; se recarga para que el usuario vea el estado vigente.
      onError: refresh,
    }),
    resetPassword: useMutation({
      mutationFn: (user: UserDto) =>
        api(`/api/v1/users/${user.id}/reset-password`, resetPasswordResponseSchema, {
          method: 'POST',
        }),
      onSuccess: refresh,
    }),
  };
}
