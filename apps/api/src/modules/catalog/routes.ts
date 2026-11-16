import {
  assetModelSchema,
  catalogListQuerySchema,
  categorySchema,
  createCategorySchema,
  createLocationSchema,
  createManufacturerSchema,
  createModelSchema,
  createStatusLabelSchema,
  locationSchema,
  manufacturerSchema,
  modelListQuerySchema,
  pageOf,
  statusLabelSchema,
  updateCategorySchema,
  updateLocationSchema,
  updateManufacturerSchema,
  updateModelSchema,
  updateStatusLabelSchema,
} from '@inventarius/shared';
import type { FastifyInstance } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../core/access.js';
import { actorOf, ifMatchOf } from '../../core/http.js';
import type { Actor } from '../audit/service.js';
import type { CatalogService } from './service.js';

const idParams = z.object({ id: z.uuid() });

/** Lo mínimo que `crud` necesita de una entidad; `CatalogEntity` lo cumple. */
interface CrudService<Dto, Create, Patch, Query> {
  list(query: Query): Promise<unknown>;
  get(id: string): Promise<Dto>;
  create(actor: Actor, input: Create): Promise<Dto>;
  update(actor: Actor, id: string, patch: Patch, expectedVersion: string): Promise<Dto>;
  remove(actor: Actor, id: string): Promise<void>;
}

interface CrudSpec<Dto, Create, Patch, Query> {
  path: string;
  service: CrudService<Dto, Create, Patch, Query>;
  dto: z.ZodType<Dto>;
  createSchema: z.ZodType<Create>;
  patchSchema: z.ZodType<Patch>;
  querySchema: z.ZodType<Query>;
}

/**
 * Monta GET/POST/PATCH/DELETE de una entidad del catálogo. Leer exige `asset:read` (los formularios de
 * activos necesitan el catálogo); escribir exige `catalog:write` (sección 3).
 */
function crud<Dto extends { updatedAt: string }, Create, Patch, Query>(
  app: FastifyInstance,
  spec: CrudSpec<Dto, Create, Patch, Query>,
): void {
  const read = requirePermission('asset:read');
  const write = requirePermission('catalog:write');
  const { path, service } = spec;
  const tags = ['catalog'];

  app.get(
    `/${path}`,
    {
      ...read,
      schema: { tags, querystring: spec.querySchema, response: { 200: pageOf(spec.dto) } },
    },
    async (req) => service.list(req.query as Query),
  );

  app.get(
    `/${path}/:id`,
    { ...read, schema: { tags, params: idParams, response: { 200: spec.dto } } },
    async (req, reply) => {
      const dto = await service.get((req.params as { id: string }).id);
      return reply.header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );

  app.post(
    `/${path}`,
    { ...write, schema: { tags, body: spec.createSchema, response: { 201: spec.dto } } },
    async (req, reply) => {
      const dto = await service.create(actorOf(req), req.body as Create);
      return reply.code(201).header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );

  app.patch(
    `/${path}/:id`,
    {
      ...write,
      schema: { tags, params: idParams, body: spec.patchSchema, response: { 200: spec.dto } },
    },
    async (req, reply) => {
      const dto = await service.update(
        actorOf(req),
        (req.params as { id: string }).id,
        req.body as Patch,
        ifMatchOf(req.headers['if-match']),
      );
      return reply.header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );

  app.delete(
    `/${path}/:id`,
    { ...write, schema: { tags, params: idParams } },
    async (req, reply) => {
      await service.remove(actorOf(req), (req.params as { id: string }).id);
      return reply.code(204).send();
    },
  );
}

export const catalogRoutes: FastifyPluginAsyncZod<{ catalog: CatalogService }> = async (
  app,
  opts,
) => {
  const { catalog } = opts;
  crud(app, {
    path: 'categories',
    service: catalog.categories,
    dto: categorySchema,
    createSchema: createCategorySchema,
    patchSchema: updateCategorySchema,
    querySchema: catalogListQuerySchema,
  });
  crud(app, {
    path: 'manufacturers',
    service: catalog.manufacturers,
    dto: manufacturerSchema,
    createSchema: createManufacturerSchema,
    patchSchema: updateManufacturerSchema,
    querySchema: catalogListQuerySchema,
  });
  crud(app, {
    path: 'models',
    service: catalog.models,
    dto: assetModelSchema,
    createSchema: createModelSchema,
    patchSchema: updateModelSchema,
    querySchema: modelListQuerySchema,
  });
  crud(app, {
    path: 'locations',
    service: catalog.locations,
    dto: locationSchema,
    createSchema: createLocationSchema,
    patchSchema: updateLocationSchema,
    querySchema: catalogListQuerySchema,
  });
  crud(app, {
    path: 'status-labels',
    service: catalog.statusLabels,
    dto: statusLabelSchema,
    createSchema: createStatusLabelSchema,
    patchSchema: updateStatusLabelSchema,
    querySchema: catalogListQuerySchema,
  });
};
