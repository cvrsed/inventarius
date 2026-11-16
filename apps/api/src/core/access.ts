import type { FastifyRequest, RouteOptions } from 'fastify';
import type { Permission, SessionUser } from '@inventarius/shared';
import { ForbiddenError, UnauthorizedError, PasswordChangeRequiredError } from './errors.js';

/** Usuario autenticado de la petición actual. */
export interface AuthContext {
  /** SHA-256 del token de sesión (el token en claro nunca se guarda). */
  sessionId: string;
  user: SessionUser;
}

/** Cada ruta de `/api/v1` DEBE declarar uno de estos accesos; si no, la app no arranca (RF-F1, sección 10.1). */
export type Access =
  | { kind: 'public' }
  | { kind: 'authenticated'; allowPendingPasswordChange?: boolean }
  | { kind: 'permission'; anyOf: readonly Permission[] };

declare module 'fastify' {
  interface FastifyContextConfig {
    access?: Access;
  }
  interface FastifyRequest {
    auth: AuthContext | null;
  }
  interface FastifyInstance {
    /** Registro de rutas con su acceso: lo consumen los tests de permisos por rol. */
    routeAccess: RouteAccessEntry[];
  }
}

export interface RouteAccessEntry {
  method: string;
  url: string;
  access: Access;
}

/** Ruta sin sesión (login, CSRF). */
export function publicRoute(): { config: { access: Access & { kind: 'public' } } } {
  return { config: { access: { kind: 'public' } } };
}

/** Ruta para cualquier usuario autenticado. `allowPendingPasswordChange` la deja usable con contraseña temporal. */
export function authenticatedRoute(opts: { allowPendingPasswordChange?: boolean } = {}): {
  config: { access: Access & { kind: 'authenticated' } };
} {
  return {
    config: {
      access: {
        kind: 'authenticated',
        ...(opts.allowPendingPasswordChange ? { allowPendingPasswordChange: true } : {}),
      },
    },
  };
}

/** Ruta que exige al menos uno de los permisos indicados. */
export function requirePermission(...anyOf: Permission[]): {
  config: { access: Access & { kind: 'permission' } };
} {
  return { config: { access: { kind: 'permission', anyOf } } };
}

/** Hook `onRoute` que impide registrar rutas del prefijo sin acceso declarado. */
export function assertRouteDeclaresAccess(prefix: string) {
  return (route: RouteOptions): void => {
    if (!route.url.startsWith(prefix)) return;
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (methods.every((m) => m === 'HEAD' || m === 'OPTIONS')) return;
    const access = (route.config as { access?: Access } | undefined)?.access;
    if (!access) {
      throw new Error(
        `Ruta ${String(route.method)} ${route.url} sin acceso declarado (usa requirePermission/publicRoute/authenticatedRoute)`,
      );
    }
  };
}

/** Evalúa el acceso declarado contra la sesión de la petición. Lanza errores del dominio. */
export function enforceAccess(access: Access, auth: AuthContext | null): void {
  if (access.kind === 'public') return;
  if (!auth) throw new UnauthorizedError();
  const pending = auth.user.mustChangePassword;
  if (pending && !(access.kind === 'authenticated' && access.allowPendingPasswordChange)) {
    throw new PasswordChangeRequiredError();
  }
  if (
    access.kind === 'permission' &&
    !access.anyOf.some((p) => auth.user.permissions.includes(p))
  ) {
    throw new ForbiddenError();
  }
}

/** Hook global `onRequest` de `/api/v1`: aplica el acceso declarado por la ruta. */
export async function accessHook(req: FastifyRequest): Promise<void> {
  const access = req.routeOptions.config.access;
  if (!access) return;
  enforceAccess(access, req.auth);
}
