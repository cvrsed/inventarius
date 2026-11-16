import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../core/errors.js';
import { Argon2Hasher, assertPasswordPolicy, generateTemporaryPassword } from './password.js';

function policyMessage(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    return (e as ValidationError).fieldErrors?.['newPassword']?.[0] ?? '';
  }
  return '';
}

describe('política de contraseñas', () => {
  it('acepta una contraseña larga y no común', () => {
    expect(() => assertPasswordPolicy('violeta-cobre-nube-87')).not.toThrow();
  });

  it('rechaza menos de 12 caracteres', () => {
    expect(() => assertPasswordPolicy('corta-123')).toThrow(ValidationError);
  });

  it.each(['password1234', 'Password123456', 'qwertyuiop12', 'contraseña123', '123456789012'])(
    'rechaza contraseñas comunes: %s',
    (pw) => {
      expect(policyMessage(() => assertPasswordPolicy(pw))).toMatch(/común/);
    },
  );

  it('rechaza un solo carácter repetido', () => {
    expect(() => assertPasswordPolicy('aaaaaaaaaaaaaa')).toThrow(ValidationError);
  });

  it('rechaza una contraseña igual al email', () => {
    const msg = policyMessage(() =>
      assertPasswordPolicy('ana.perez@ejemplo.cl', { email: 'ana.perez@ejemplo.cl' }),
    );
    expect(msg).toMatch(/correo/);
  });

  it('el error trae el campo para la UI', () => {
    try {
      assertPasswordPolicy('corta');
    } catch (e) {
      expect((e as ValidationError).fieldErrors).toHaveProperty('newPassword');
    }
  });
});

describe('Argon2Hasher', () => {
  const hasher = new Argon2Hasher();

  it('genera argon2id y verifica correctamente', async () => {
    const hash = await hasher.hash('violeta-cobre-nube-87');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 'violeta-cobre-nube-87')).toBe(true);
    expect(await hasher.verify(hash, 'otra-contraseña-distinta')).toBe(false);
  });

  it('dos hashes de la misma contraseña difieren (sal aleatoria)', async () => {
    const [a, b] = await Promise.all([
      hasher.hash('violeta-cobre-nube-87'),
      hasher.hash('violeta-cobre-nube-87'),
    ]);
    expect(a).not.toBe(b);
  });

  it('verify devuelve false ante un hash corrupto, sin lanzar', async () => {
    expect(await hasher.verify('no-es-un-hash', 'x')).toBe(false);
  });
});

describe('generateTemporaryPassword', () => {
  it('cumple la política y es distinta cada vez', () => {
    const a = generateTemporaryPassword();
    const b = generateTemporaryPassword();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(() => assertPasswordPolicy(a)).not.toThrow();
  });
});
