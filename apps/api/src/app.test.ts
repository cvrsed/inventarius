import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { buildApp } from './app.js';
import { loadConfig } from './core/config.js';
import { ConflictError } from './core/errors.js';

const config = loadConfig({ DATABASE_URL: 'postgres://x', LOG_LEVEL: 'silent', NODE_ENV: 'test' });
const health = { database: async () => true, queue: async () => true };

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
});

describe('manejo central de errores', () => {
  it('mapea errores del dominio a problem+json con su status', async () => {
    app = await buildApp({ config, health });
    app.get('/api/t/conflict', async () => {
      throw new ConflictError('Etiqueta duplicada');
    });
    const res = await app.inject({ url: '/api/t/conflict' });
    expect(res.statusCode).toBe(409);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 409, detail: 'Etiqueta duplicada' });
  });

  it('responde 400 con errores por campo cuando falla la validación Zod', async () => {
    app = await buildApp({ config, health });
    app
      .withTypeProvider<ZodTypeProvider>()
      .get(
        '/api/t/validate',
        { schema: { querystring: z.object({ page: z.coerce.number().int().min(1) }) } },
        async () => ({ ok: true }),
      );
    const res = await app.inject({ url: '/api/t/validate?page=0' });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors.page).toBeDefined();
  });

  it('no filtra detalles internos en errores inesperados', async () => {
    app = await buildApp({ config, health });
    app.get('/api/t/boom', async () => {
      throw new Error('password=super-secreto en la consulta SQL');
    });
    const res = await app.inject({ url: '/api/t/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('super-secreto');
    expect(res.json().title).toBe('Error interno');
  });

  it('respeta los errores 4xx de Fastify (p. ej. JSON malformado)', async () => {
    app = await buildApp({ config, health });
    app.post('/api/t/echo', async () => ({ ok: true }));
    const res = await app.inject({
      method: 'POST',
      url: '/api/t/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{malo',
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});
