import {
  lorawanImportPreviewSchema,
  lorawanImportRequestSchema,
  lorawanImportResultSchema,
  lorawanSchema,
  revealKeysResultSchema,
  updateLorawanSchema,
} from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../core/access.js';
import { actorOf } from '../../core/http.js';
import type { LorawanImportService } from './import-service.js';
import type { LorawanService } from './service.js';

const idParams = z.object({ id: z.uuid() });
const tags = ['lorawan'];

/** Datos LoRaWAN del activo, reveal de claves e importación CSV (RF-21, RF-30, RF-66). */
export const lorawanRoutes: FastifyPluginAsyncZod<{
  lorawan: LorawanService;
  imports: LorawanImportService;
}> = async (app, opts) => {
  const { lorawan, imports } = opts;

  app.get(
    '/assets/:id/lorawan',
    {
      ...requirePermission('lorawan:read'),
      schema: { tags, params: idParams, response: { 200: lorawanSchema } },
    },
    async (req, reply) =>
      reply.header('cache-control', 'no-store').send(await lorawan.get(req.params.id)),
  );

  app.patch(
    '/assets/:id/lorawan',
    {
      ...requirePermission('asset:write'),
      schema: {
        tags,
        params: idParams,
        body: updateLorawanSchema,
        response: { 200: lorawanSchema },
      },
    },
    async (req, reply) =>
      reply
        .header('cache-control', 'no-store')
        .send(await lorawan.update(actorOf(req), req.params.id, req.body)),
  );

  // POST y no GET: es una acción con efecto (queda auditada) y nunca debe quedar en cachés ni en el historial.
  app.post(
    '/assets/:id/lorawan/reveal',
    {
      ...requirePermission('lorawan:keys:reveal'),
      schema: { tags, params: idParams, response: { 200: revealKeysResultSchema } },
    },
    async (req, reply) =>
      reply
        .header('cache-control', 'no-store')
        .send(await lorawan.reveal(actorOf(req), req.params.id)),
  );

  app.post(
    '/lorawan/import/preview',
    {
      ...requirePermission('asset:write'),
      bodyLimit: 3_000_000,
      schema: {
        tags,
        body: lorawanImportRequestSchema,
        response: { 200: lorawanImportPreviewSchema },
      },
    },
    async (req) => imports.preview(req.body.csv),
  );

  app.post(
    '/lorawan/import',
    {
      ...requirePermission('asset:write'),
      bodyLimit: 3_000_000,
      schema: {
        tags,
        body: lorawanImportRequestSchema,
        response: { 200: lorawanImportResultSchema },
      },
    },
    async (req) => imports.apply(actorOf(req), req.body.csv),
  );
};
