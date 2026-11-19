import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../../test/app.js';

let env: TestEnv;
beforeAll(async () => {
  // Inactividad corta, como en el stack de e2e: el refresco de la sesión debe escalar con ella.
  env = await createTestEnv({ SESSION_IDLE_TIMEOUT_SECONDS: '15' });
  await env.createUser({ email: 'touch@ejemplo.cl', role: 'Operador' });
});
afterAll(async () => env.close());

describe('actividad y expiración por inactividad (RF-01)', () => {
  it('la actividad frecuente mantiene viva la sesión aunque la inactividad sea corta', async () => {
    const c = env.client('10.9.1.1');
    await c.login('touch@ejemplo.cl');
    // Cinco segundos entre pedidos durante un minuto: nunca hay 15 s de silencio.
    for (let i = 0; i < 12; i++) {
      env.clock.advance(5);
      expect((await c.get('/api/v1/auth/me')).statusCode, `pedido ${i + 1}`).toBe(200);
    }
  });

  it('quince segundos sin actividad la cierran', async () => {
    const c = env.client('10.9.1.2');
    await c.login('touch@ejemplo.cl');
    env.clock.advance(16);
    expect((await c.get('/api/v1/auth/me')).statusCode).toBe(401);
  });
});
