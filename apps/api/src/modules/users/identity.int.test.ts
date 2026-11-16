import { PERMISSIONS } from '@inventarius/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  STRONG_PASSWORD,
  createTestEnv,
  type TestClient,
  type TestEnv,
} from '../../../test/app.js';

let env: TestEnv;
let admin: TestClient;
let adminId: string;

beforeAll(async () => {
  env = await createTestEnv();
  adminId = await env.createUser({ email: 'root@ejemplo.cl', role: 'Administrador', name: 'Root' });
  admin = env.client();
  await admin.login('root@ejemplo.cl');
});
afterAll(async () => env.close());

const roleId = async (name: string) =>
  (await env.services.rbac.listRoles()).find((r) => r.name === name)!.id;
const etag = (res: { headers: Record<string, unknown> }) => String(res.headers['etag']);

describe('usuarios (RF-03)', () => {
  it('crea un usuario con contraseña inicial que debe cambiar y devuelve ETag', async () => {
    const res = await admin.post('/api/v1/users', {
      email: 'Nuevo@Ejemplo.cl',
      name: 'Nuevo Usuario',
      roleIds: [await roleId('Lector')],
      password: STRONG_PASSWORD,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      email: 'nuevo@ejemplo.cl',
      active: true,
      mustChangePassword: true,
    });
    expect(res.json().roles).toEqual([{ id: await roleId('Lector'), name: 'Lector' }]);
    expect(etag(res)).toBeTruthy();
    expect(JSON.stringify(res.json())).not.toMatch(/passwordHash|password_hash|argon2|fast:/i);
  });

  it('rechaza correo duplicado (409) y contraseña débil (422)', async () => {
    const body = {
      email: 'dup@ejemplo.cl',
      name: 'Dup',
      roleIds: [await roleId('Lector')],
      password: STRONG_PASSWORD,
    };
    expect((await admin.post('/api/v1/users', body)).statusCode).toBe(201);
    expect(
      (await admin.post('/api/v1/users', { ...body, email: 'DUP@ejemplo.cl' })).statusCode,
    ).toBe(409);
    const weak = await admin.post('/api/v1/users', {
      ...body,
      email: 'debil@ejemplo.cl',
      password: 'password1234',
    });
    expect(weak.statusCode).toBe(422);
  });

  it('lista con búsqueda y paginación del lado servidor', async () => {
    for (const n of ['uno', 'dos', 'tres']) {
      await admin.post('/api/v1/users', {
        email: `${n}@lista.cl`,
        name: `Persona ${n}`,
        roleIds: [await roleId('Lector')],
        password: STRONG_PASSWORD,
      });
    }
    const page = await admin.get('/api/v1/users?q=lista.cl&pageSize=2&page=1');
    expect(page.json().meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(page.json().data).toHaveLength(2);
    const second = await admin.get('/api/v1/users?q=lista.cl&pageSize=2&page=2');
    expect(second.json().data).toHaveLength(1);
  });

  it('PATCH exige If-Match (428) y detecta ediciones simultáneas (412)', async () => {
    const created = await admin.post('/api/v1/users', {
      email: 'conc@ejemplo.cl',
      name: 'Conc',
      roleIds: [await roleId('Lector')],
      password: STRONG_PASSWORD,
    });
    const { id } = created.json() as { id: string };
    expect((await admin.patch(`/api/v1/users/${id}`, { name: 'X' })).statusCode).toBe(428);

    const first = await admin.patch(
      `/api/v1/users/${id}`,
      { name: 'Primero' },
      { 'if-match': etag(created) },
    );
    expect(first.statusCode).toBe(200);
    expect(first.json().name).toBe('Primero');
    const stale = await admin.patch(
      `/api/v1/users/${id}`,
      { name: 'Segundo' },
      { 'if-match': etag(created) },
    );
    expect(stale.statusCode).toBe(412);
    const ok = await admin.patch(
      `/api/v1/users/${id}`,
      { name: 'Segundo' },
      { 'if-match': etag(first) },
    );
    expect(ok.statusCode).toBe(200);
  });

  it('cambia los roles y los permisos del usuario se reflejan de inmediato', async () => {
    const created = await admin.post('/api/v1/users', {
      email: 'ascenso@ejemplo.cl',
      name: 'Asc',
      roleIds: [await roleId('Lector')],
      password: STRONG_PASSWORD,
    });
    await env.db.migratorPool.query(
      "UPDATE users SET must_change_password = false WHERE email = 'ascenso@ejemplo.cl'",
    );
    const user = env.client();
    await user.login('ascenso@ejemplo.cl');
    expect((await user.get('/api/v1/auth/me')).json().permissions).not.toContain('asset:write');
    await admin.patch(
      `/api/v1/users/${created.json().id}`,
      { roleIds: [await roleId('Operador')] },
      { 'if-match': etag(created) },
    );
    expect((await user.get('/api/v1/auth/me')).json().permissions).toContain('asset:write');
  });

  it('desactivar un usuario invalida sus sesiones y le impide entrar', async () => {
    const created = await admin.post('/api/v1/users', {
      email: 'baja@ejemplo.cl',
      name: 'Baja',
      roleIds: [await roleId('Lector')],
      password: STRONG_PASSWORD,
    });
    await env.db.migratorPool.query(
      "UPDATE users SET must_change_password = false WHERE email = 'baja@ejemplo.cl'",
    );
    const user = env.client();
    await user.login('baja@ejemplo.cl');
    expect((await user.get('/api/v1/auth/me')).statusCode).toBe(200);
    const off = await admin.patch(
      `/api/v1/users/${created.json().id}`,
      { active: false },
      { 'if-match': etag(created) },
    );
    expect(off.statusCode).toBe(200);
    expect((await user.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect((await env.client().login('baja@ejemplo.cl')).statusCode).toBe(401);
  });

  it('siempre debe quedar al menos un administrador activo', async () => {
    const me = await admin.get(`/api/v1/users/${adminId}`);
    const deactivate = await admin.patch(
      `/api/v1/users/${adminId}`,
      { active: false },
      { 'if-match': etag(me) },
    );
    expect(deactivate.statusCode).toBe(409);
    const demote = await admin.patch(
      `/api/v1/users/${adminId}`,
      { roleIds: [await roleId('Lector')] },
      { 'if-match': etag(me) },
    );
    expect(demote.statusCode).toBe(409);

    // Con un segundo administrador activo, el primero sí puede degradarse.
    const second = await env.createUser({ email: 'root2@ejemplo.cl', role: 'Administrador' });
    expect(second).toBeTruthy();
    const me2 = await admin.get(`/api/v1/users/${adminId}`);
    const ok = await admin.patch(
      `/api/v1/users/${adminId}`,
      { name: 'Root Renombrado' },
      { 'if-match': etag(me2) },
    );
    expect(ok.statusCode).toBe(200);
  });
});

describe('correo electrónico (RF-03)', () => {
  const makeUser = async (email: string, role = 'Lector') => {
    const created = await admin.post('/api/v1/users', {
      email,
      name: 'Correo',
      roleIds: [await roleId(role)],
      password: STRONG_PASSWORD,
    });
    await env.db.migratorPool.query(
      'UPDATE users SET must_change_password = false WHERE email = $1',
      [email],
    );
    return created;
  };

  it('un administrador cambia el correo: invalida sus sesiones, entra con el nuevo y queda antes/después en auditoría', async () => {
    const created = await makeUser('viejo@ejemplo.cl');
    const user = env.client();
    await user.login('viejo@ejemplo.cl');
    expect((await user.get('/api/v1/auth/me')).statusCode).toBe(200);

    const res = await admin.patch(
      `/api/v1/users/${created.json().id}`,
      { email: 'Nuevo.Correo@Ejemplo.cl' },
      { 'if-match': etag(created) },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe('nuevo.correo@ejemplo.cl');

    expect((await user.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect((await env.client().login('viejo@ejemplo.cl')).statusCode).toBe(401);
    expect((await env.client().login('nuevo.correo@ejemplo.cl')).statusCode).toBe(200);

    const audit = await admin.get(
      `/api/v1/audit?entity=user&action=user.update&actorId=${adminId}`,
    );
    const entry = audit
      .json()
      .data.find((e: { entityId: string }) => e.entityId === created.json().id);
    expect(entry.diff.before.email).toBe('viejo@ejemplo.cl');
    expect(entry.diff.after.email).toBe('nuevo.correo@ejemplo.cl');
  });

  it('no invalida sesiones si el correo no cambia, y rechaza uno ya usado (409)', async () => {
    const created = await makeUser('igual@ejemplo.cl');
    await makeUser('ocupado@ejemplo.cl');
    const user = env.client();
    await user.login('igual@ejemplo.cl');
    const same = await admin.patch(
      `/api/v1/users/${created.json().id}`,
      { email: 'IGUAL@ejemplo.cl', name: 'Mismo correo' },
      { 'if-match': etag(created) },
    );
    expect(same.statusCode).toBe(200);
    expect((await user.get('/api/v1/auth/me')).statusCode).toBe(200);

    const dup = await admin.patch(
      `/api/v1/users/${created.json().id}`,
      { email: 'ocupado@ejemplo.cl' },
      { 'if-match': etag(same) },
    );
    expect(dup.statusCode).toBe(409);
    expect((await user.get('/api/v1/auth/me')).statusCode).toBe(200);
  });

  it('nadie edita su propio correo, ni siquiera un administrador', async () => {
    const me = await admin.get(`/api/v1/users/${adminId}`);
    const res = await admin.patch(
      `/api/v1/users/${adminId}`,
      { email: 'otro@ejemplo.cl' },
      { 'if-match': etag(me) },
    );
    expect(res.statusCode).toBe(403);
    expect((await admin.get(`/api/v1/users/${adminId}`)).json().email).toBe('root@ejemplo.cl');
  });

  it('un usuario sin user:manage no puede cambiar ningún correo, ni el suyo', async () => {
    const created = await makeUser('operador@ejemplo.cl', 'Operador');
    const op = env.client();
    await op.login('operador@ejemplo.cl');
    const res = await op.patch(
      `/api/v1/users/${created.json().id}`,
      { email: 'robado@ejemplo.cl' },
      { 'if-match': etag(created) },
    );
    expect(res.statusCode).toBe(403);
    expect((await op.get('/api/v1/auth/me')).json().email).toBe('operador@ejemplo.cl');
  });
});

describe('cambio de correo por CLI (operación)', () => {
  const emailOf = async (id: string) =>
    (await env.db.migratorPool.query('SELECT email FROM users WHERE id = $1', [id])).rows[0]
      .email as string;

  it('sirve para el correo de un administrador, incluso el único: cierra sus sesiones y audita con actor cli', async () => {
    const solo = await env.createUser({ email: 'unico@ejemplo.cl', role: 'Administrador' });
    const session = env.client('10.7.0.1');
    await session.login('unico@ejemplo.cl');
    expect((await session.get('/api/v1/auth/me')).statusCode).toBe(200);

    const out = await env.services.users.changeEmailByCli(
      'UNICO@ejemplo.cl',
      'Nuevo.Unico@Ejemplo.cl',
    );
    expect(out.email).toBe('nuevo.unico@ejemplo.cl');
    expect(await emailOf(solo)).toBe('nuevo.unico@ejemplo.cl');

    expect((await session.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect((await env.client('10.7.0.2').login('unico@ejemplo.cl')).statusCode).toBe(401);
    expect((await env.client('10.7.0.3').login('nuevo.unico@ejemplo.cl')).statusCode).toBe(200);

    const rows = (
      await env.db.migratorPool.query(
        "SELECT actor_id, actor_label, diff FROM audit_log WHERE action = 'user.update' AND entity_id = $1 ORDER BY id DESC LIMIT 1",
        [solo],
      )
    ).rows;
    expect(rows[0].actor_id).toBeNull();
    expect(rows[0].actor_label).toBe('cli');
    expect(rows[0].diff.before.email).toBe('unico@ejemplo.cl');
    expect(rows[0].diff.after.email).toBe('nuevo.unico@ejemplo.cl');
  });

  it('la API muestra el actor cli en la auditoría', async () => {
    const res = await admin.get('/api/v1/audit?entity=user&action=user.update');
    const entry = res
      .json()
      .data.find((e: { actorLabel: string | null }) => e.actorLabel === 'cli');
    expect(entry).toMatchObject({ actorId: null, actorName: null, actorLabel: 'cli' });
  });

  it('valida: correo inválido, igual al actual, ya usado y usuario inexistente', async () => {
    await env.createUser({ email: 'a-cli@ejemplo.cl', role: 'Lector' });
    await env.createUser({ email: 'b-cli@ejemplo.cl', role: 'Lector' });
    const run = (from: string, to: string) => env.services.users.changeEmailByCli(from, to);
    await expect(run('a-cli@ejemplo.cl', 'no-es-correo')).rejects.toMatchObject({ status: 422 });
    await expect(run('a-cli@ejemplo.cl', 'A-CLI@ejemplo.cl')).rejects.toMatchObject({
      status: 422,
    });
    await expect(run('a-cli@ejemplo.cl', 'b-cli@ejemplo.cl')).rejects.toMatchObject({
      status: 409,
    });
    await expect(run('fantasma@ejemplo.cl', 'otro@ejemplo.cl')).rejects.toMatchObject({
      status: 404,
    });
    const untouched = await env.db.migratorPool.query(
      "SELECT count(*)::int AS n FROM users WHERE email IN ('a-cli@ejemplo.cl','b-cli@ejemplo.cl')",
    );
    expect(untouched.rows[0].n).toBe(2);
  });

  it('un cambio fallido no deja rastro de auditoría', async () => {
    const before = (await env.db.migratorPool.query('SELECT count(*)::int AS n FROM audit_log'))
      .rows[0].n;
    await expect(
      env.services.users.changeEmailByCli('a-cli@ejemplo.cl', 'b-cli@ejemplo.cl'),
    ).rejects.toMatchObject({ status: 409 });
    const after = (await env.db.migratorPool.query('SELECT count(*)::int AS n FROM audit_log'))
      .rows[0].n;
    expect(after).toBe(before);
  });
});

describe('roles y permisos (sección 3)', () => {
  it('crea un rol, edita su matriz con If-Match y lo borra si no tiene usuarios', async () => {
    const created = await admin.post('/api/v1/roles', {
      name: 'Auditor',
      description: 'Solo auditoría',
      permissions: ['audit:read', 'asset:read'],
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;
    expect(created.json().permissions).toEqual(['asset:read', 'audit:read']);

    expect(
      (await admin.patch(`/api/v1/roles/${id}`, { permissions: ['asset:read'] })).statusCode,
    ).toBe(428);
    const patched = await admin.patch(
      `/api/v1/roles/${id}`,
      { permissions: ['asset:read'] },
      { 'if-match': etag(created) },
    );
    expect(patched.statusCode).toBe(200);
    expect(patched.json().permissions).toEqual(['asset:read']);
    expect(
      (
        await admin.patch(
          `/api/v1/roles/${id}`,
          { description: 'x' },
          { 'if-match': etag(created) },
        )
      ).statusCode,
    ).toBe(412);

    expect((await admin.delete(`/api/v1/roles/${id}`)).statusCode).toBe(204);
    expect(
      (await admin.get('/api/v1/roles')).json().map((r: { name: string }) => r.name),
    ).not.toContain('Auditor');
  });

  it('el nombre del rol es único', async () => {
    expect(
      (await admin.post('/api/v1/roles', { name: 'Operador', permissions: [] })).statusCode,
    ).toBe(409);
  });

  it('el Administrador es intocable y los roles semilla no se borran ni renombran', async () => {
    const roles = (await admin.get('/api/v1/roles')).json() as {
      id: string;
      name: string;
      updatedAt: string;
    }[];
    const adminRole = roles.find((r) => r.name === 'Administrador')!;
    const operator = roles.find((r) => r.name === 'Operador')!;
    expect(
      (
        await admin.patch(
          `/api/v1/roles/${adminRole.id}`,
          { permissions: ['asset:read'] },
          { 'if-match': adminRole.updatedAt },
        )
      ).statusCode,
    ).toBe(422);
    expect((await admin.delete(`/api/v1/roles/${adminRole.id}`)).statusCode).toBe(409);
    expect((await admin.delete(`/api/v1/roles/${operator.id}`)).statusCode).toBe(409);
    expect(
      (
        await admin.patch(
          `/api/v1/roles/${operator.id}`,
          { name: 'Otro' },
          { 'if-match': operator.updatedAt },
        )
      ).statusCode,
    ).toBe(422);
  });

  it('un rol semilla no protegido sí admite cambiar su matriz, y rige de inmediato', async () => {
    await env.createUser({ email: 'lector@ejemplo.cl', role: 'Lector' });
    const reader = env.client();
    await reader.login('lector@ejemplo.cl');
    expect((await reader.get('/api/v1/audit')).statusCode).toBe(403);
    const lectorRole = (await admin.get('/api/v1/roles'))
      .json()
      .find((r: { name: string }) => r.name === 'Lector');
    const res = await admin.patch(
      `/api/v1/roles/${lectorRole.id}`,
      { permissions: ['asset:read', 'lorawan:read', 'audit:read'] },
      { 'if-match': lectorRole.updatedAt },
    );
    expect(res.statusCode).toBe(200);
    expect((await reader.get('/api/v1/audit')).statusCode).toBe(200);
  });

  it('no se borra un rol con usuarios asignados', async () => {
    const created = await admin.post('/api/v1/roles', {
      name: 'Temporal',
      permissions: ['asset:read'],
    });
    await admin.post('/api/v1/users', {
      email: 'conrol@ejemplo.cl',
      name: 'Con Rol',
      roleIds: [created.json().id],
      password: STRONG_PASSWORD,
    });
    expect((await admin.delete(`/api/v1/roles/${created.json().id}`)).statusCode).toBe(409);
  });

  it('lista el catálogo fijo de permisos', async () => {
    const res = await admin.get('/api/v1/permissions');
    expect(res.json()).toHaveLength(PERMISSIONS.length);
  });
});

describe('auditoría (RF-30, RF-31)', () => {
  it('registra quién, qué, cuándo y el diff de cada escritura, sin secretos', async () => {
    const created = await admin.post('/api/v1/users', {
      email: 'audit@ejemplo.cl',
      name: 'Audit',
      roleIds: [await roleId('Lector')],
      password: STRONG_PASSWORD,
    });
    await admin.patch(
      `/api/v1/users/${created.json().id}`,
      { name: 'Audit Dos' },
      { 'if-match': etag(created) },
    );

    const res = await admin.get(`/api/v1/audit?entity=user&action=user.update&actorId=${adminId}`);
    expect(res.statusCode).toBe(200);
    const entry = res
      .json()
      .data.find((e: { entityId: string }) => e.entityId === created.json().id);
    expect(entry).toMatchObject({
      actorName: expect.stringContaining('Root'),
      action: 'user.update',
      entity: 'user',
    });
    expect(entry.diff.before.name).toBe('Audit');
    expect(entry.diff.after.name).toBe('Audit Dos');
    expect(entry.ip).toBeTruthy();

    const all = await env.db.migratorPool.query('SELECT diff::text AS d FROM audit_log');
    expect(all.rows.map((r: { d: string | null }) => r.d ?? '').join('')).not.toMatch(
      /fast:|argon2|passwordHash|violeta/,
    );
  });

  it('filtra por rango de fechas y pagina', async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const none = await admin.get(`/api/v1/audit?from=${encodeURIComponent(future)}`);
    expect(none.json().meta.total).toBe(0);
    const some = await admin.get('/api/v1/audit?pageSize=2');
    expect(some.json().data).toHaveLength(2);
    expect(some.json().meta.total).toBeGreaterThan(2);
  });

  it('el usuario de la app no puede modificar ni borrar el rastro (append-only)', async () => {
    const pool = env.db.pool;
    await expect(pool.query("UPDATE audit_log SET action = 'x'")).rejects.toThrow(
      /permission denied/,
    );
    await expect(pool.query('DELETE FROM audit_log')).rejects.toThrow(/permission denied/);
    await expect(pool.query('TRUNCATE audit_log')).rejects.toThrow(/permission denied/);
    await expect(
      pool.query("INSERT INTO audit_log (action, entity) VALUES ('test.insert', 'test')"),
    ).resolves.toBeDefined();
  });
});
