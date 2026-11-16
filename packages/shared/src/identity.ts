import { z } from 'zod';
import { PERMISSIONS } from './permissions.js';

export const MIN_PASSWORD_LENGTH = 12;

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(256);
export const permissionSchema = z.enum(PERMISSIONS);

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256),
});
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: passwordSchema,
});

export const csrfResponseSchema = z.object({ token: z.string() });

export const sessionUserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  mustChangePassword: z.boolean(),
  roles: z.array(z.string()),
  permissions: z.array(permissionSchema),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const roleRefSchema = z.object({ id: z.uuid(), name: z.string() });

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  active: z.boolean(),
  mustChangePassword: z.boolean(),
  roles: z.array(roleRefSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type UserDto = z.infer<typeof userSchema>;

export const createUserRequestSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(120),
  roleIds: z.array(z.uuid()).min(1),
  /** Contraseña inicial; el usuario deberá cambiarla al entrar. */
  password: passwordSchema,
});
export const updateUserRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    active: z.boolean(),
    roleIds: z.array(z.uuid()).min(1),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');

export const resetPasswordResponseSchema = z.object({ temporaryPassword: z.string() });

export const roleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  isSystem: z.boolean(),
  isProtected: z.boolean(),
  permissions: z.array(permissionSchema),
  userCount: z.number().int(),
  updatedAt: z.iso.datetime(),
});
export type RoleDto = z.infer<typeof roleSchema>;

export const createRoleRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).default(''),
  permissions: z.array(permissionSchema),
});
export const updateRoleRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(240),
    permissions: z.array(permissionSchema),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Indica al menos un campo');

export const auditEntrySchema = z.object({
  id: z.string(),
  at: z.iso.datetime(),
  actorId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  diff: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().nullable(),
});
export type AuditEntryDto = z.infer<typeof auditEntrySchema>;

export const pageMetaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export function pageOf<T extends z.ZodType>(item: T) {
  return z.object({ data: z.array(item), meta: pageMetaSchema });
}

export const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
