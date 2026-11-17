import { dashboardSummarySchema } from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { requirePermission } from '../../core/access.js';
import type { DashboardService } from './service.js';

/** Resumen del Inicio (RF-28). Lo ve quien puede leer activos. */
export const dashboardRoutes: FastifyPluginAsyncZod<{ dashboard: DashboardService }> = async (
  app,
  opts,
) => {
  app.get(
    '/dashboard',
    {
      ...requirePermission('asset:read'),
      schema: { tags: ['dashboard'], response: { 200: dashboardSummarySchema } },
    },
    async (req, reply) => {
      const summary = await opts.dashboard.summary(req.auth!.user.id);
      return reply.header('cache-control', 'no-store').send(summary);
    },
  );
};
