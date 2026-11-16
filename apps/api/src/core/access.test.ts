import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { ForbiddenError, PasswordChangeRequiredError, UnauthorizedError } from './errors.js';
import {
  assertRouteDeclaresAccess,
  enforceAccess,
  authenticatedRoute,
  publicRoute,
  requirePermission,
  type AuthContext,
} from './access.js';

const ctx = (permissions: string[], mustChangePassword = false): AuthContext => ({
  sessionId: 's',
  user: {
    id: '018f0000-0000-7000-8000-000000000001',
    email: 'a@b.cl',
    name: 'A',
    mustChangePassword,
    roles: [],
    permissions: permissions as AuthContext['user']['permissions'],
  },
});

describe('helpers de acceso', () => {
  it('requirePermission declara el permiso en la config de la ruta', () => {
    expect(requirePermission('asset:write').config.access).toEqual({
      kind: 'permission',
      anyOf: ['asset:write'],
    });
    expect(requirePermission('user:manage', 'role:manage').config.access).toEqual({
      kind: 'permission',
      anyOf: ['user:manage', 'role:manage'],
    });
  });
  it('publicRoute y authenticatedRoute declaran su tipo', () => {
    expect(publicRoute().config.access.kind).toBe('public');
    expect(authenticatedRoute({ allowPendingPasswordChange: true }).config.access).toEqual({
      kind: 'authenticated',
      allowPendingPasswordChange: true,
    });
  });
});

describe('assertRouteDeclaresAccess', () => {
  it('lanza al registrar una ruta de /api/v1 sin acceso declarado', async () => {
    const app = Fastify();
    app.addHook('onRoute', assertRouteDeclaresAccess('/api/v1'));
    expect(() => app.get('/api/v1/oculta', async () => 'x')).toThrow(/sin acceso declarado/);
  });

  it('permite rutas con acceso declarado y rutas fuera del prefijo', async () => {
    const app = Fastify();
    app.addHook('onRoute', assertRouteDeclaresAccess('/api/v1'));
    expect(() => app.get('/api/v1/ok', publicRoute(), async () => 'x')).not.toThrow();
    expect(() => app.get('/api/health/live', async () => 'x')).not.toThrow();
  });
});

describe('enforceAccess', () => {
  it('public deja pasar sin sesión', () => {
    expect(() => enforceAccess({ kind: 'public' }, null)).not.toThrow();
  });
  it('sin sesión: 401', () => {
    expect(() => enforceAccess({ kind: 'authenticated' }, null)).toThrow(UnauthorizedError);
  });
  it('con permiso pasa; sin permiso: 403', () => {
    const access = { kind: 'permission', anyOf: ['asset:write'] } as const;
    expect(() => enforceAccess(access, ctx(['asset:write']))).not.toThrow();
    expect(() => enforceAccess(access, ctx(['asset:read']))).toThrow(ForbiddenError);
  });
  it('anyOf: basta uno de los permisos', () => {
    const access = { kind: 'permission', anyOf: ['user:manage', 'role:manage'] } as const;
    expect(() => enforceAccess(access, ctx(['role:manage']))).not.toThrow();
  });
  it('con contraseña temporal solo pasan las rutas que lo permiten', () => {
    const pending = ctx(['asset:read'], true);
    expect(() => enforceAccess({ kind: 'authenticated' }, pending)).toThrow(
      PasswordChangeRequiredError,
    );
    expect(() => enforceAccess({ kind: 'permission', anyOf: ['asset:read'] }, pending)).toThrow(
      PasswordChangeRequiredError,
    );
    expect(() =>
      enforceAccess({ kind: 'authenticated', allowPendingPasswordChange: true }, pending),
    ).not.toThrow();
  });
});
