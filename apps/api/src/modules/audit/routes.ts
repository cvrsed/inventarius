import { auditEntrySchema, pageOf, pageQuerySchema } from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../core/access.js';
import type { AuditService } from './service.js';

const querySchema = pageQuerySchema.extend({
  actorId: z.uuid().optional(),
  entity: z.string().min(1).max(60).optional(),
  action: z.string().min(1).max(60).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

/** RF-31: vista de auditoría filtrable por usuario, entidad, acción y rango de fechas. */
export const auditRoutes: FastifyPluginAsyncZod<{ audit: AuditService }> = async (app, opts) => {
  app.get(
    '/audit',
    {
      ...requirePermission('audit:read'),
      schema: {
        tags: ['audit'],
        querystring: querySchema,
        response: { 200: pageOf(auditEntrySchema) },
      },
    },
    async (req) => {
      const { page, pageSize, from, to, ...rest } = req.query;
      return opts.audit.list(
        { ...rest, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined },
        { page, pageSize },
      );
    },
  );
};
