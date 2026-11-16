import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../../core/config.js';

/** Con `Secure` se usa el prefijo `__Host-` (sin Domain, Path=/); sin HTTPS el navegador lo rechazaría. */
export function cookieNames(secure: boolean): { session: string; csrf: string } {
  return secure
    ? { session: '__Host-session', csrf: '__Host-csrf' }
    : { session: 'session', csrf: 'csrf' };
}

export function setSessionCookie(
  reply: FastifyReply,
  name: string,
  token: string,
  config: AppConfig,
): void {
  reply.setCookie(name, token, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: 'strict',
    path: '/',
    // Cookie de sesión del navegador; la expiración real la impone el servidor (inactividad y absoluta).
  });
}

export function clearSessionCookie(reply: FastifyReply, name: string, config: AppConfig): void {
  reply.clearCookie(name, {
    httpOnly: true,
    secure: config.session.cookieSecure,
    sameSite: 'strict',
    path: '/',
  });
}
