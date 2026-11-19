import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Token CSRF firmado y ligado a la sesión (RF-01, sección 10.1). El token es un HMAC-SHA256, con el secreto de
 * configuración, del «vínculo» de quien lo pide: el id de la sesión si hay una, o, antes del login, un valor
 * aleatorio de una cookie propia. Un token generado para otra sesión (o sin vínculo) no valida, aunque esté bien
 * firmado: no basta con robar un token de otra cuenta ni con inyectar una cookie.
 */
export function csrfToken(secret: string, binding: string): string {
  return createHmac('sha256', secret).update(`csrf:v1:${binding}`).digest('base64url');
}

/** Compara en tiempo constante. `false` si falta el token, el vínculo o si no coinciden. */
export function csrfTokenValid(
  secret: string,
  binding: string | undefined,
  token: string | undefined,
): boolean {
  if (!binding || !token) return false;
  const expected = Buffer.from(csrfToken(secret, binding));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Valor aleatorio que vincula el token CSRF de quien aún no tiene sesión (p. ej. para el login). */
export const newAnonymousBinding = (): string => randomBytes(32).toString('base64url');
