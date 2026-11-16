import argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { MIN_PASSWORD_LENGTH } from '@inventarius/shared';
import { ValidationError } from '../../core/errors.js';

/** Puerto de hashing: se inyecta para poder usar un hasher rápido en tests que no prueban argon2. */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

/** argon2id con los parámetros mínimos recomendados por OWASP (19 MiB, 2 iteraciones, 1 hilo). */
export class Argon2Hasher implements PasswordHasher {
  private static readonly options = {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  } as const;

  hash(password: string): Promise<string> {
    return argon2.hash(password, Argon2Hasher.options);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}

// Lista mínima embebida; ampliarla con un diccionario completo está en docs/open-questions.md (Q12).
const COMMON_PASSWORDS = new Set([
  'password',
  'passw0rd',
  'contrasena',
  'contraseña',
  'qwerty',
  'qwertyuiop',
  'qwertyuiopasdf',
  'asdfghjkl',
  'zxcvbnm',
  'abc123',
  'letmein',
  'welcome',
  'admin',
  'administrador',
  'administrator',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'master',
  'login',
  'princess',
  'trustno1',
  'inventarius',
  'chile',
  'santiago',
  'colocolo',
  'bienvenido',
  'bienvenida',
  'cambiame',
  'cambiar',
  'secreto',
  'secret',
  'changeme',
  'changeit',
  'default',
  'test',
  'testing',
  'guest',
  'root',
  'toor',
  'user',
  'usuario',
  'clave',
  'abcdef',
  'abcdefghijkl',
  'unodostres',
  '123456',
  '1234567890',
  '123456789012',
  '12345678',
  '111111',
  '000000',
  'zaq12wsx',
  '1q2w3e4r',
  '1qaz2wsx',
]);

const PLAIN_PASSWORD_FIELD = 'newPassword';

function stripDecorations(value: string): string {
  return value.toLowerCase().replace(/[^a-záéíóúñü]/g, '');
}

function fail(message: string): never {
  throw new ValidationError('La contraseña no cumple la política de seguridad', {
    [PLAIN_PASSWORD_FIELD]: [message],
  });
}

/**
 * Valida la política (sección 10.1): largo mínimo, no estar en la lista de contraseñas comunes
 * (también con dígitos/símbolos alrededor), no ser un único carácter repetido ni el propio correo.
 */
export function assertPasswordPolicy(password: string, context: { email?: string } = {}): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(stripDecorations(password))) {
    fail('Es una contraseña demasiado común; elige una frase menos predecible');
  }
  if (new Set(password).size === 1) fail('No puede ser un solo carácter repetido');
  if (context.email && lower === context.email.toLowerCase())
    fail('No puede ser igual a tu correo');
}

const TEMP_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Contraseña temporal de un uso (RF-04): 20 caracteres sin ambigüedades visuales (sin 0/O, 1/l/I). */
export function generateTemporaryPassword(length = 20): string {
  let out = '';
  for (let i = 0; i < length; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  return out;
}
