import { SEED_ROLES, type Permission } from '@inventarius/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from '../../../test/app.js';

let env: TestEnv;
const clients = new Map<string, TestClient>();
const DUMMY_ID = '018f0000-0000-7000-8000-00000000abcd';

beforeAll(async () => {
  env = await createTestEnv();
  let i = 0;
  for (const role of SEED_ROLES) {
    const email = `rol${i++}@ejemplo.cl`;
    await env.createUser({ email, role: role.name });
    const c = env.client(`10.20.0.${i}`);
    await c.login(email);
    clients.set(role.name, c);
  }
});
afterAll(async () => env.close());

describe('semilla de RBAC', () => {
  it('la BD coincide con la matriz de packages/shared (sección 3)', async () => {
    const roles = await env.services.rbac.listRoles();
    expect(roles.map((r) => r.name).sort()).toEqual(SEED_ROLES.map((r) => r.name).sort());
    for (const seed of SEED_ROLES) {
      const db = roles.find((r) => r.name === seed.name)!;
      expect(db.permissions).toEqual([...seed.permissions].sort());
      expect(db.isProtected).toBe(seed.isProtected);
      expect(db.isSystem).toBe(true);
    }
  });
});

describe('permisos por rol en TODAS las rutas de /api/v1', () => {
  const concreteUrl = (url: string) => url.replace(/:id\b/g, DUMMY_ID);

  it('hay rutas registradas con acceso declarado', () => {
    const v1 = env.app.routeAccess.filter((r) => r.url.startsWith('/api/v1'));
    expect(v1.length).toBeGreaterThanOrEqual(15);
  });

  it('cada ruta responde según el permiso exigido para cada rol y sin sesión', async () => {
    const entries = env.app.routeAccess.filter(
      (r) => r.url.startsWith('/api/v1') && r.method !== 'HEAD',
    );
    const failures: string[] = [];
    let n = 0;

    for (const entry of entries) {
      const label = `${entry.method} ${entry.url}`;
      const call = async (client: TestClient) =>
        client.request({
          method: entry.method as 'GET',
          url: concreteUrl(entry.url),
          ...(entry.method === 'GET' || entry.method === 'DELETE' ? {} : { payload: {} }),
          headers: { 'if-match': 'x' },
        });

      // Sin sesión.
      const anon = await call(env.client('10.30.0.1'));
      if (entry.access.kind === 'public') {
        if (anon.statusCode === 401 || anon.statusCode === 403)
          failures.push(`${label}: pública pero respondió ${anon.statusCode}`);
      } else if (anon.statusCode !== 401) {
        failures.push(`${label}: anónimo debía dar 401 y dio ${anon.statusCode}`);
      }

      // Cada rol semilla.
      for (const seed of SEED_ROLES) {
        // Cliente fresco por llamada para que logout/etc. no afecten a las siguientes.
        const c = env.client(`10.31.${Math.floor(++n / 250)}.${(n % 250) + 1}`);
        const email = `rol${SEED_ROLES.indexOf(seed)}@ejemplo.cl`;
        if (!(await c.login(email)).statusCode.toString().startsWith('2')) {
          // El login puede estar bloqueado por IP si se abusa; usamos una IP distinta por rol.
          failures.push(`${label}: no se pudo iniciar sesión como ${seed.name}`);
          continue;
        }
        const res = await call(c);
        const allowed =
          entry.access.kind !== 'permission' ||
          entry.access.anyOf.some((p: Permission) => seed.permissions.includes(p));
        if (allowed && (res.statusCode === 401 || res.statusCode === 403)) {
          failures.push(`${label}: ${seed.name} debía poder y dio ${res.statusCode}`);
        }
        if (!allowed && res.statusCode !== 403) {
          failures.push(`${label}: ${seed.name} no debía poder y dio ${res.statusCode}`);
        }
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
