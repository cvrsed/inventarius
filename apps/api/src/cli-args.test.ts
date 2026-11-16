import { describe, expect, it } from 'vitest';
import { createAdminInput, updateEmailInput } from './cli-args.js';

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

describe('updateEmailInput', () => {
  it('lee y normaliza el correo actual y el nuevo', () => {
    expect(
      updateEmailInput(['--email-actual', 'Vieja@Ejemplo.cl', '--email-nuevo', 'NUEVA@ejemplo.cl']),
    ).toEqual({ currentEmail: 'vieja@ejemplo.cl', newEmail: 'nueva@ejemplo.cl' });
  });

  it('exige ambos argumentos', () => {
    expect(() => updateEmailInput(['--email-nuevo', 'a@ejemplo.cl'])).toThrow(/--email-actual/);
    expect(() => updateEmailInput(['--email-actual', 'a@ejemplo.cl'])).toThrow(/--email-nuevo/);
  });

  it('rechaza correos inválidos', () => {
    expect(() =>
      updateEmailInput(['--email-actual', 'a@ejemplo.cl', '--email-nuevo', 'x']),
    ).toThrow(/no es válido/);
    expect(() =>
      updateEmailInput(['--email-actual', 'x', '--email-nuevo', 'a@ejemplo.cl']),
    ).toThrow(/no es válido/);
  });
});
