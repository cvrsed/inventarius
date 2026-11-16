import {
  assetExportQuerySchema,
  assetFiltersSchema,
  assetListQuerySchema,
  assetSchema,
  assigneeSchema,
  auditEntrySchema,
  checkinRequestSchema,
  checkoutRequestSchema,
  createAssetSchema,
  deleteAssetRequestSchema,
  assetListItemSchema,
  pageOf,
  pageQuerySchema,
  updateAssetSchema,
} from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { requirePermission } from '../../core/access.js';
import { actorOf, ifMatchOf } from '../../core/http.js';
import type { AssetsService } from './service.js';

const idParams = z.object({ id: z.uuid() });
const tags = ['assets'];

/** Activos (RF-20 a RF-26): permisos según la sección 3 del requerimiento. */
export const assetsRoutes: FastifyPluginAsyncZod<{ assets: AssetsService }> = async (app, opts) => {
  const { assets } = opts;
  const read = requirePermission('asset:read');

  app.get(
    '/assets',
    {
      ...read,
      schema: {
        tags,
        querystring: assetListQuerySchema,
        response: { 200: pageOf(assetListItemSchema) },
      },
    },
    async (req) => {
      const { page, pageSize, sort, ...filters } = req.query;
      return assets.list(assetFiltersSchema.parse(filters), sort, { page, pageSize });
    },
  );

  app.get(
    '/assets/export',
    { ...read, schema: { tags, querystring: assetExportQuerySchema } },
    async (req, reply) => {
      const { sort, ...filters } = req.query;
      const day = new Date().toISOString().slice(0, 10);
      return reply
        .type('text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="activos-${day}.csv"`)
        .header('cache-control', 'no-store')
        .send(Readable.from(assets.exportCsv(assetFiltersSchema.parse(filters), sort)));
    },
  );

  app.get(
    '/assets/:id',
    { ...read, schema: { tags, params: idParams, response: { 200: assetSchema } } },
    async (req, reply) => {
      const asset = await assets.get(req.params.id);
      return reply.header('etag', `"${asset.updatedAt}"`).send(asset);
    },
  );

  app.get(
    '/assets/:id/history',
    {
      ...read,
      schema: {
        tags,
        params: idParams,
        querystring: pageQuerySchema,
        response: { 200: pageOf(auditEntrySchema) },
      },
    },
    async (req) => assets.history(req.params.id, req.query),
  );

  app.post(
    '/assets',
    {
      ...requirePermission('asset:write'),
      schema: { tags, body: createAssetSchema, response: { 201: assetSchema } },
    },
    async (req, reply) => {
      const asset = await assets.create(actorOf(req), req.body);
      return reply.code(201).header('etag', `"${asset.updatedAt}"`).send(asset);
    },
  );

  app.patch(
    '/assets/:id',
    {
      ...requirePermission('asset:write'),
      schema: { tags, params: idParams, body: updateAssetSchema, response: { 200: assetSchema } },
    },
    async (req, reply) => {
      const asset = await assets.update(
        actorOf(req),
        req.params.id,
        req.body,
        ifMatchOf(req.headers['if-match']),
      );
      return reply.header('etag', `"${asset.updatedAt}"`).send(asset);
    },
  );

  app.post(
    '/assets/:id/checkout',
    {
      ...requirePermission('asset:checkout'),
      schema: {
        tags,
        params: idParams,
        body: checkoutRequestSchema,
        response: { 200: assetSchema },
      },
    },
    async (req, reply) => {
      const asset = await assets.checkout(actorOf(req), req.params.id, req.body);
      return reply.header('etag', `"${asset.updatedAt}"`).send(asset);
    },
  );

  app.post(
    '/assets/:id/checkin',
    {
      ...requirePermission('asset:checkout'),
      schema: {
        tags,
        params: idParams,
        body: checkinRequestSchema,
        response: { 200: assetSchema },
      },
    },
    async (req, reply) => {
      const asset = await assets.checkin(actorOf(req), req.params.id, req.body);
      return reply.header('etag', `"${asset.updatedAt}"`).send(asset);
    },
  );

  app.delete(
    '/assets/:id',
    {
      ...requirePermission('asset:delete'),
      schema: { tags, params: idParams, body: deleteAssetRequestSchema },
    },
    async (req, reply) => {
      await assets.remove(actorOf(req), req.params.id, req.body.reason);
      return reply.code(204).send();
    },
  );

  app.post(
    '/assets/:id/restore',
    {
      ...requirePermission('asset:restore'),
      schema: { tags, params: idParams, response: { 200: assetSchema } },
    },
    async (req, reply) => {
      const asset = await assets.restore(actorOf(req), req.params.id);
      return reply.header('etag', `"${asset.updatedAt}"`).send(asset);
    },
  );

  app.get(
    '/assignees',
    {
      ...requirePermission('asset:checkout'),
      schema: {
        tags,
        querystring: z.object({
          q: z.string().trim().max(100).optional(),
          id: z.uuid().optional(),
        }),
        response: { 200: z.array(assigneeSchema) },
      },
    },
    async (req) => assets.assignees(req.query.q, req.query.id),
  );
};
