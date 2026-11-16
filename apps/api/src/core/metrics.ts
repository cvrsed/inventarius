import type { FastifyPluginAsync } from 'fastify';
import fastifyMetrics from 'fastify-metrics';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from './config.js';
import { ForbiddenError } from './errors.js';
import { isInternalAddress } from './network.js';

function tokenMatches(header: string | undefined, expected: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer\s+/i, '') ?? '');
  const want = Buffer.from(expected);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Métricas Prometheus en `/api/metrics`. Con `METRICS_TOKEN` se exige bearer;
 * sin token, solo responde a clientes de la red interna.
 */
export const metricsPlugin: FastifyPluginAsync<{ config: AppConfig }> = async (app, opts) => {
  await app.register(fastifyMetrics, { endpoint: null, name: 'metrics' });
  // El registro de prom-client es global al proceso; sin limpiarlo, una segunda app (tests) falla.
  app.addHook('onClose', async () => {
    app.metrics.client.register.clear();
  });

  app.get(
    '/metrics',
    {
      schema: { hide: true },
      onRequest: async (req) => {
        const { metricsToken } = opts.config;
        const allowed = metricsToken
          ? tokenMatches(req.headers.authorization, metricsToken)
          : isInternalAddress(req.ip);
        if (!allowed) throw new ForbiddenError('Métricas disponibles solo para la red interna');
      },
    },
    async (_req, reply) => {
      const body = await app.metrics.client.register.metrics();
      return reply.type(app.metrics.client.register.contentType).send(body);
    },
  );
};
