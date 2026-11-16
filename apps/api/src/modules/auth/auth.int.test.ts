import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STRONG_PASSWORD, createTestEnv, type TestEnv } from '../../../test/app.js';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv({
    SESSION_IDLE_TIMEOUT_SECONDS: '600',
    SESSION_ABSOLUTE_TIMEOUT_SECONDS: '3600',
  });
  await env.createUser({ email: 'ana@ejemplo.cl', role: 'Operador' });
  await env.createUser({ email: 'root@ejemplo.cl', role: 'Administrador' });
});
afterAll(async () => env.close());

describe('login y sesión (RF-01)', () => {
  it('inicia sesión, fija cookie HttpOnly SameSite=Strict y devuelve el usuario con sus permisos', async () => {
    const c = env.client();
    const res = await c.login('ana@ejemplo.cl');
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((x) => x.name === 'session');
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    const me = await c.get('/api/v1/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: 'ana@ejemplo.cl', roles: ['Operador'] });
    expect(me.json().permissions).toContain('asset:write');
    expect(me.json().permissions).not.toContain('user:manage');
  });

  it('el email no distingue mayúsculas', async () => {
    expect((await env.client().login('ANA@Ejemplo.CL')).statusCode).toBe(200);
  });

  it('credenciales incorrectas y cuenta inexistente dan la misma respuesta (sin enumerar cuentas)', async () => {
    const bad = await env.client('10.1.0.1').login('ana@ejemplo.cl', 'otra-contraseña-incorrecta');
    const ghost = await env
      .client('10.1.0.2')
      .login('nadie@ejemplo.cl', 'otra-contraseña-incorrecta');
    expect(bad.statusCode).toBe(401);
    expect(ghost.statusCode).toBe(401);
    expect(ghost.json().detail).toBe(bad.json().detail);
  });

  it('exige token CSRF en peticiones que cambian estado', async () => {
    const res = await env.client().request({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'ana@ejemplo.cl', password: STRONG_PASSWORD },
      csrf: false,
    });
    expect(res.statusCode).toBe(403);
  });

  it('cada login rota el ID de sesión y solo se guarda su hash', async () => {
    const a = env.client();
    const b = env.client();
    await a.login('ana@ejemplo.cl');
    await b.login('ana@ejemplo.cl');
    expect(a.cookie['session']).not.toBe(b.cookie['session']);
    const rows = await env.db.migratorPool.query('SELECT id FROM sessions');
    const ids = rows.rows.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(a.cookie['session']);
    expect(ids.every((id: string) => /^[0-9a-f]{64}$/.test(id))).toBe(true);
  });

  it('logout cierra la sesión en el servidor', async () => {
    const c = env.client();
    await c.login('ana@ejemplo.cl');
    const stolen = c.cookie['session']!;
    expect((await c.post('/api/v1/auth/logout')).statusCode).toBe(204);
    const replay = env.client();
    replay.setCookie('session', stolen);
    expect((await replay.get('/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('sin cookie: 401 problem+json', async () => {
    const res = await env.client().get('/api/v1/auth/me');
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});

describe('rate limit del login (RF-05)', () => {
  it('limita a 20 intentos por minuto y por IP, con problem+json', async () => {
    const ip = '10.8.0.1';
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++)
      statuses.push((await env.client(ip).login('ana@ejemplo.cl')).statusCode);
    expect(statuses.slice(0, 20).every((s) => s === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe('expiración de sesión (RF-01)', () => {
  it('expira por inactividad y se renueva con actividad', async () => {
    const c = env.client();
    await c.login('ana@ejemplo.cl');
    env.clock.advance(500);
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(200);
    env.clock.advance(500); // 500 s desde la última actividad: sigue viva
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(200);
    env.clock.advance(601); // más de 600 s sin actividad
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('expira por tiempo absoluto aunque haya actividad', async () => {
    const c = env.client();
    await c.login('ana@ejemplo.cl');
    for (let i = 0; i < 7; i++) {
      env.clock.advance(500);
      await c.get('/api/v1/auth/me');
    }
    env.clock.advance(500); // total > 3600 s
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(401);
  });
});

describe('bloqueo por intentos fallidos (RF-05)', () => {
  it('bloquea la cuenta tras 5 fallos, incluso con la contraseña correcta, y se libera con el tiempo', async () => {
    await env.createUser({ email: 'lock@ejemplo.cl', role: 'Lector' });
    for (let i = 0; i < 5; i++) {
      const res = await env
        .client(`10.2.0.${i + 1}`)
        .login('lock@ejemplo.cl', 'incorrecta-incorrecta');
      expect(res.statusCode).toBe(401);
    }
    const blocked = await env.client('10.2.1.1').login('lock@ejemplo.cl');
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    env.clock.advance(61);
    expect((await env.client('10.2.1.1').login('lock@ejemplo.cl')).statusCode).toBe(200);
  });

  it('el bloqueo es progresivo: reincidir tras el desbloqueo lo alarga', async () => {
    await env.createUser({ email: 'prog@ejemplo.cl', role: 'Lector' });
    for (let i = 0; i < 5; i++)
      await env.client(`10.3.0.${i + 1}`).login('prog@ejemplo.cl', 'incorrecta-incorrecta');
    env.clock.advance(61); // termina el primer bloqueo (60 s)
    const sixth = await env.client('10.3.0.9').login('prog@ejemplo.cl', 'incorrecta-incorrecta');
    expect(sixth.statusCode).toBe(401); // este intento sí cuenta
    const res = await env.client('10.3.1.1').login('prog@ejemplo.cl');
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(60);
  });

  it('bloquea por IP aunque cambie la cuenta', async () => {
    const ip = '10.4.0.1';
    for (let i = 0; i < 20; i++)
      await env.client(ip).login(`fantasma${i}@ejemplo.cl`, 'incorrecta-incorrecta');
    const res = await env.client(ip).login('ana@ejemplo.cl');
    expect(res.statusCode).toBe(429);
  });

  it('un login correcto reinicia el contador de la cuenta', async () => {
    await env.createUser({ email: 'reset@ejemplo.cl', role: 'Lector' });
    for (let i = 0; i < 4; i++)
      await env.client(`10.5.0.${i + 1}`).login('reset@ejemplo.cl', 'incorrecta-incorrecta');
    expect((await env.client('10.5.1.1').login('reset@ejemplo.cl')).statusCode).toBe(200);
    for (let i = 0; i < 4; i++)
      await env.client(`10.5.2.${i + 1}`).login('reset@ejemplo.cl', 'incorrecta-incorrecta');
    expect((await env.client('10.5.3.1').login('reset@ejemplo.cl')).statusCode).toBe(200);
  });
});

describe('cambio de contraseña (RF-04)', () => {
  it('rechaza la contraseña actual incorrecta y las contraseñas débiles', async () => {
    await env.createUser({ email: 'cambio@ejemplo.cl', role: 'Lector' });
    const c = env.client();
    await c.login('cambio@ejemplo.cl');
    const wrong = await c.post('/api/v1/auth/change-password', {
      currentPassword: 'no-es-esa-contraseña',
      newPassword: 'otra-clave-bien-larga-1',
    });
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().errors.currentPassword).toBeDefined();
    const weak = await c.post('/api/v1/auth/change-password', {
      currentPassword: STRONG_PASSWORD,
      newPassword: 'password1234',
    });
    expect(weak.statusCode).toBe(422);
    expect(weak.json().errors.newPassword[0]).toMatch(/común/);
  });

  it('cambia la contraseña, cierra las demás sesiones y deja una nueva', async () => {
    await env.createUser({ email: 'cambio2@ejemplo.cl', role: 'Lector' });
    const a = env.client();
    const b = env.client();
    await a.login('cambio2@ejemplo.cl');
    await b.login('cambio2@ejemplo.cl');
    const res = await a.post('/api/v1/auth/change-password', {
      currentPassword: STRONG_PASSWORD,
      newPassword: 'nueva-clave-segura-2026',
    });
    expect(res.statusCode).toBe(200);
    expect((await a.get('/api/v1/auth/me')).statusCode).toBe(200);
    expect((await b.get('/api/v1/auth/me')).statusCode).toBe(401);
    expect((await env.client().login('cambio2@ejemplo.cl')).statusCode).toBe(401);
    expect(
      (await env.client().login('cambio2@ejemplo.cl', 'nueva-clave-segura-2026')).statusCode,
    ).toBe(200);
  });
});

describe('contraseña temporal (RF-04)', () => {
  it('el reseteo de un administrador obliga a cambiarla antes de usar la app', async () => {
    const targetId = await env.createUser({ email: 'temp@ejemplo.cl', role: 'Operador' });
    const victim = env.client();
    await victim.login('temp@ejemplo.cl');

    const admin = env.client();
    await admin.login('root@ejemplo.cl');
    const reset = await admin.post(`/api/v1/users/${targetId}/reset-password`);
    expect(reset.statusCode).toBe(200);
    const { temporaryPassword } = reset.json() as { temporaryPassword: string };
    expect(reset.headers['cache-control']).toBe('no-store');

    // La sesión previa murió.
    expect((await victim.get('/api/v1/auth/me')).statusCode).toBe(401);

    const fresh = env.client();
    expect((await fresh.login('temp@ejemplo.cl', temporaryPassword)).statusCode).toBe(200);
    expect((await fresh.get('/api/v1/auth/me')).json().mustChangePassword).toBe(true);
    const blocked = await fresh.get('/api/v1/users');
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().type).toContain('password-change-required');

    const change = await fresh.post('/api/v1/auth/change-password', {
      currentPassword: temporaryPassword,
      newPassword: 'definitiva-clave-2026',
    });
    expect(change.statusCode).toBe(200);
    expect((await fresh.get('/api/v1/auth/me')).json().mustChangePassword).toBe(false);
  });
});

describe('auditoría de autenticación (RF-30)', () => {
  it('registra logins correctos y fallidos con IP, sin guardar contraseñas', async () => {
    const c = env.client('10.9.9.9');
    await c.login('ana@ejemplo.cl', 'incorrecta-incorrecta');
    await c.login('ana@ejemplo.cl');
    const rows = await env.db.migratorPool.query(
      "SELECT action, ip::text AS ip, diff::text AS diff FROM audit_log WHERE ip = '10.9.9.9' ORDER BY id",
    );
    expect(rows.rows.map((r: { action: string }) => r.action)).toEqual([
      'auth.login_failed',
      'auth.login',
    ]);
    expect(rows.rows.map((r: { diff: string | null }) => r.diff ?? '').join()).not.toMatch(
      /incorrecta|violeta/,
    );
  });
});
