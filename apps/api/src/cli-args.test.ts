import { describe, expect, it } from 'vitest';
import { createAdminInput } from './cli-args.js';

const prompts = {
  email: async () => 'pregunta@ejemplo.cl',
  name: async () => 'Pregunta',
  password: async () => 'clave-desde-prompt-123',
};

describe('createAdminInput', () => {
  it('toma correo y nombre de los argumentos y la contraseña de la variable indicada', async () => {
    const out = await createAdminInput(
      ['--email', 'Admin@Ejemplo.cl', '--name', 'Admin Uno', '--password-env', 'ADMIN_PW'],
      { ADMIN_PW: 'clave-desde-entorno-123' },
      prompts,
    );
    expect(out).toEqual({
      email: 'admin@ejemplo.cl',
      name: 'Admin Uno',
      password: 'clave-desde-entorno-123',
    });
  });

  it('pregunta lo que falte', async () => {
    const out = await createAdminInput([], {}, prompts);
    expect(out).toEqual({
      email: 'pregunta@ejemplo.cl',
      name: 'Pregunta',
      password: 'clave-desde-prompt-123',
    });
  });

  it('rechaza que la contraseña venga como argumento', async () => {
    await expect(createAdminInput(['--password', 'x'], {}, prompts)).rejects.toThrow(
      /--password-env/,
    );
  });

  it('falla si la variable indicada no está definida', async () => {
    await expect(createAdminInput(['--password-env', 'NO_EXISTE'], {}, prompts)).rejects.toThrow(
      /NO_EXISTE/,
    );
  });

  it('valida el formato del correo', async () => {
    await expect(createAdminInput(['--email', 'no-es-correo'], {}, prompts)).rejects.toThrow(
      /correo/,
    );
  });
});
