import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../../test/app.js';

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
  await env.createUser({ email: 'lector@ejemplo.cl', role: 'Lector' });
});
afterAll(async () => env.close());

describe('GET /settings', () => {
  it('exige sesión', async () => {
    expect((await env.client('10.9.0.1').get('/api/v1/settings')).statusCode).toBe(401);
  });

  it('entrega la zona horaria configurada a cualquier usuario autenticado', async () => {
    const client = env.client('10.9.0.2');
    await client.login('lector@ejemplo.cl');
    const res = await client.get('/api/v1/settings');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ timezone: 'America/Santiago', defaultCurrency: 'CLP' });
  });
});
