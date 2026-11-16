import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../../test/app.js';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
  await env.createUser({ email: 'def@ejemplo.cl', role: 'Operador' });
});
afterAll(async () => env.close());

describe('expiración con la configuración por defecto (RF-01)', () => {
  it('la sesión vive 24 h aunque haya actividad cada 7 h', async () => {
    const c = env.client('10.9.0.1');
    await c.login('def@ejemplo.cl');
    for (let i = 0; i < 3; i++) {
      env.clock.advance(7 * 3600);
      expect((await c.get('/api/v1/auth/me')).statusCode).toBe(200);
    }
    env.clock.advance(3 * 3600 + 1); // 24 h + 1 s desde el login; la última actividad fue hace 3 h
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(401);
  });

  it('la inactividad de 8 h la corta antes de las 24 h', async () => {
    const c = env.client('10.9.0.2');
    await c.login('def@ejemplo.cl');
    env.clock.advance(8 * 3600 - 1);
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(200);
    env.clock.advance(8 * 3600 + 1);
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(401);
  });
});
