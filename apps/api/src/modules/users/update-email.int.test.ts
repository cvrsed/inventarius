import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../../test/app.js';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(async () => env.close());

describe('cambio de correo por CLI con un único administrador', () => {
  it('permite cambiar el correo del único administrador y deja que entre con el nuevo', async () => {
    await env.createUser({ email: 'solo@ejemplo.cl', role: 'Administrador' });
    const admins = await env.db.migratorPool.query(
      "SELECT count(*)::int AS n FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE r.name = 'Administrador'",
    );
    expect(admins.rows[0].n).toBe(1);

    const session = env.client('10.8.0.1');
    await session.login('solo@ejemplo.cl');
    await env.services.users.changeEmailByCli('solo@ejemplo.cl', 'admin.nuevo@ejemplo.cl');

    expect((await session.get('/api/v1/auth/me')).statusCode).toBe(401);
    const fresh = env.client('10.8.0.2');
    expect((await fresh.login('admin.nuevo@ejemplo.cl')).statusCode).toBe(200);
    expect((await fresh.get('/api/v1/auth/me')).json().roles).toEqual(['Administrador']);
  });
});
