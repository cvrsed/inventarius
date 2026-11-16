import { liveResponseSchema, readyResponseSchema } from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { checkReadiness, type HealthProbes } from './service.js';

/** Plugin Fastify del módulo health; las sondas llegan por opciones. */
export const healthRoutes: FastifyPluginAsyncZod<{ probes: HealthProbes }> = async (app, opts) => {
  app.get(
    '/health/live',
    { schema: { tags: ['health'], response: { 200: liveResponseSchema } } },
    async () => ({ status: 'ok' as const }),
  );

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        response: { 200: readyResponseSchema, 503: readyResponseSchema },
      },
    },
    async (_req, reply) => {
      const result = await checkReadiness(opts.probes);
      return reply.code(result.status === 'ok' ? 200 : 503).send(result);
    },
  );
};
