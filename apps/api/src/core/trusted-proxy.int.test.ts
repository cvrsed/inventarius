import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, STRONG_PASSWORD, type TestEnv } from '../../test/app.js';

/**
 * La IP de la auditoría (RF-30) no puede falsearse con `X-Forwarded-For`: solo se acepta de un proxy conocido
 * (`TRUSTED_PROXIES`). Cada caso usa una IP de origen distinta para poder buscar su registro.
 */
let env: TestEnv;
beforeAll(async () => {
  // Solo Caddy (172.20.0.5) es proxy de confianza.
  env = await createTestEnv({ TRUSTED_PROXIES: '172.20.0.5' });
  await env.createUser({ email: 'ana@ejemplo.cl', role: 'Operador' });
});
afterAll(async () => env.close());

async function loginIp(from: string, xff?: string): Promise<string | undefined> {
  const res = await env.app.inject({
    method: 'GET',
    url: '/api/v1/auth/csrf',
    remoteAddress: from,
  });
  const token = (res.json() as { token: string }).token;
  const cookies = Object.fromEntries(res.cookies.map((c) => [c.name, c.value]));
  const login = await env.app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress: from,
    cookies,
    headers: { 'x-csrf-token': token, ...(xff ? { 'x-forwarded-for': xff } : {}) },
    payload: { email: 'ana@ejemplo.cl', password: STRONG_PASSWORD },
  });
  expect(login.statusCode).toBe(200);
  const rows = await env.db.migratorPool.query(
    "SELECT host(ip) AS ip FROM audit_log WHERE action = 'auth.login' ORDER BY id DESC LIMIT 1",
  );
  return rows.rows[0]?.ip as string | undefined;
}

describe('IP real en la auditoría (RF-30)', () => {
  it('un origen no confiable con X-Forwarded-For falso registra la IP del socket', async () => {
    const ip = await loginIp('203.0.113.7', '6.6.6.6');
    expect(ip).toBe('203.0.113.7');
  });

  it('un origen privado que no es el proxy tampoco puede falsearla', async () => {
    const ip = await loginIp('10.9.9.9', '6.6.6.6, 7.7.7.7');
    expect(ip).toBe('10.9.9.9');
  });

  it('el proxy conocido sí informa la IP del cliente', async () => {
    const ip = await loginIp('172.20.0.5', '198.51.100.23');
    expect(ip).toBe('198.51.100.23');
  });

  it('con el proxy conocido, una cadena falseada por el cliente se ignora hasta el primer origen real', async () => {
    // El cliente (198.51.100.23) antepuso 6.6.6.6; Caddy añadió la IP que vio. Se toma la última no confiable.
    const ip = await loginIp('172.20.0.5', '6.6.6.6, 198.51.100.23');
    expect(ip).toBe('198.51.100.23');
  });
});
