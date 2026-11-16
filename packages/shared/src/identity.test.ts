import { describe, expect, it } from 'vitest';
import {
  changePasswordRequestSchema,
  createRoleRequestSchema,
  createUserRequestSchema,
  emailSchema,
  loginRequestSchema,
  pageQuerySchema,
  updateRoleRequestSchema,
  updateUserRequestSchema,
} from './identity.js';
import { problemSchema } from './problem.js';

const id = '018f0000-0000-7000-8000-000000000001';

describe('esquemas de identidad', () => {
  it('normaliza el correo (recorta y pasa a minúsculas)', () => {
    expect(emailSchema.parse('  Ana@Ejemplo.CL ')).toBe('ana@ejemplo.cl');
    expect(emailSchema.safeParse('no-es-correo').success).toBe(false);
  });

  it('login no impone largo de contraseña (eso lo decide el servidor)', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.cl', password: 'x' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'a@b.cl', password: '' }).success).toBe(false);
  });

  it('la contraseña nueva exige 12 caracteres', () => {
    const base = { currentPassword: 'x' };
    expect(changePasswordRequestSchema.safeParse({ ...base, newPassword: 'corta' }).success).toBe(
      false,
    );
    expect(
      changePasswordRequestSchema.safeParse({ ...base, newPassword: 'doce-caracteres' }).success,
    ).toBe(true);
  });

  it('crear usuario exige al menos un rol', () => {
    const base = { email: 'a@b.cl', name: 'Ana', password: 'doce-caracteres' };
    expect(createUserRequestSchema.safeParse({ ...base, roleIds: [] }).success).toBe(false);
    expect(createUserRequestSchema.safeParse({ ...base, roleIds: [id] }).success).toBe(true);
  });

  it('las actualizaciones parciales rechazan un cuerpo vacío', () => {
    expect(updateUserRequestSchema.safeParse({}).success).toBe(false);
    expect(updateUserRequestSchema.safeParse({ active: false }).success).toBe(true);
    expect(updateRoleRequestSchema.safeParse({}).success).toBe(false);
    expect(updateRoleRequestSchema.safeParse({ description: 'x' }).success).toBe(true);
  });

  it('crear rol valida que los permisos existan y pone descripción por defecto', () => {
    expect(
      createRoleRequestSchema.parse({ name: 'Auditor', permissions: ['audit:read'] }).description,
    ).toBe('');
    expect(
      createRoleRequestSchema.safeParse({ name: 'X', permissions: ['inventado:todo'] }).success,
    ).toBe(false);
  });

  it('la paginación aplica valores por defecto y tope de 100', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 25 });
    expect(pageQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(pageQuerySchema.parse({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10 });
  });
});

describe('problemSchema', () => {
  it('acepta un problem+json con errores por campo', () => {
    const p = problemSchema.parse({
      type: 'x',
      title: 'T',
      status: 422,
      errors: { name: ['Requerido'] },
    });
    expect(p.errors?.['name']).toEqual(['Requerido']);
  });
});
