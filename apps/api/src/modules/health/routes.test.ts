import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../core/config.js';
import type { FastifyInstance } from 'fastify';

const config = loadConfig({ DATABASE_URL: 'postgres://x', LOG_LEVEL: 'silent', NODE_ENV: 'test' });

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
});

describe('GET /api/health', () => {
  it('live responde ok sin tocar dependencias', async () => {
    app = await buildApp({
      config,
      health: {
        database: () => Promise.reject(new Error('no debería llamarse')),
        queue: () => Promise.reject(new Error('no')),
      },
    });
    const res = await app.inject({ url: '/api/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('ready responde 200 si BD y cola están arriba', async () => {
    app = await buildApp({
      config,
      health: { database: async () => true, queue: async () => true },
    });
    const res = await app.inject({ url: '/api/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', checks: { database: 'up', queue: 'up' } });
  });

  it('ready responde 503 si un componente falla o lanza', async () => {
    app = await buildApp({
      config,
      health: { database: async () => true, queue: () => Promise.reject(new Error('boom')) },
    });
    const res = await app.inject({ url: '/api/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'degraded', checks: { database: 'up', queue: 'down' } });
  });

  it('propaga x-request-id', async () => {
    app = await buildApp({
      config,
      health: { database: async () => true, queue: async () => true },
    });
    const res = await app.inject({
      url: '/api/health/live',
      headers: { 'x-request-id': 'req-123' },
    });
    expect(res.headers['x-request-id']).toBe('req-123');
  });
});

describe('errores', () => {
  it('rutas inexistentes responden problem+json 404', async () => {
    app = await buildApp({
      config,
      health: { database: async () => true, queue: async () => true },
    });
    const res = await app.inject({ url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});

describe('GET /api/metrics', () => {
  const health = { database: async () => true, queue: async () => true };

  it('sirve métricas Prometheus a clientes de red interna', async () => {
    app = await buildApp({ config, health });
    const res = await app.inject({ url: '/api/metrics', remoteAddress: '10.0.0.5' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('http_request_duration_seconds');
  });

  it('rechaza clientes externos sin token', async () => {
    app = await buildApp({ config, health });
    const res = await app.inject({ url: '/api/metrics', remoteAddress: '8.8.8.8' });
    expect(res.statusCode).toBe(403);
  });

  it('con METRICS_TOKEN exige bearer correcto incluso desde red interna', async () => {
    app = await buildApp({ config: { ...config, metricsToken: 's3cret' }, health });
    const bad = await app.inject({ url: '/api/metrics', remoteAddress: '10.0.0.5' });
    expect(bad.statusCode).toBe(403);
    const ok = await app.inject({
      url: '/api/metrics',
      remoteAddress: '8.8.8.8',
      headers: { authorization: 'Bearer s3cret' },
    });
    expect(ok.statusCode).toBe(200);
  });
});

describe('OpenAPI', () => {
  it('se publica fuera de producción', async () => {
    app = await buildApp({
      config,
      health: { database: async () => true, queue: async () => true },
    });
    const res = await app.inject({ url: '/api/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().paths['/api/health/live']).toBeDefined();
  });

  it('no se publica en producción', async () => {
    app = await buildApp({
      config: { ...config, isProduction: true, nodeEnv: 'production' },
      health: { database: async () => true, queue: async () => true },
    });
    const res = await app.inject({ url: '/api/openapi.json' });
    expect(res.statusCode).toBe(404);
  });
});
