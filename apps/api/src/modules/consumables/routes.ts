import {
  adjustmentSchema,
  consumableDetailSchema,
  consumableListQuerySchema,
  consumableSchema,
  createConsumableSchema,
  createMeasureUnitSchema,
  deliverySchema,
  measureUnitSchema,
  movementListQuerySchema,
  movementResultSchema,
  movementSchema,
  pageOf,
  receiptSchema,
  recipientSchema,
  reversalSchema,
  transferSchema,
  updateConsumableSchema,
  updateMeasureUnitSchema,
  catalogListQuerySchema,
} from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../core/access.js';
import { ValidationError } from '../../core/errors.js';
import { actorOf, ifMatchOf } from '../../core/http.js';
import type { ConsumablesService } from './service.js';

const idParams = z.object({ id: z.uuid() });
const tags = ['consumables'];

/** Los movimientos los hace una persona con sesión: el actor nunca puede faltar. */
const actor = (req: Parameters<typeof actorOf>[0]) => {
  const a = actorOf(req);
  if (!a.actorId) throw new ValidationError('Se necesita una sesión de usuario');
  return a;
};

export const consumablesRoutes: FastifyPluginAsyncZod<{ consumables: ConsumablesService }> = async (
  app,
  opts,
) => {
  const { consumables } = opts;
  const read = requirePermission('consumables:read');
  const manage = requirePermission('consumables:manage');

  // --- Unidades de medida (D4) ---
  const units = consumables.units;
  app.get(
    '/measure-units',
    {
      ...read,
      schema: {
        tags,
        querystring: catalogListQuerySchema,
        response: { 200: pageOf(measureUnitSchema) },
      },
    },
    async (req) => units.list(req.query),
  );
  app.post(
    '/measure-units',
    {
      ...manage,
      schema: { tags, body: createMeasureUnitSchema, response: { 201: measureUnitSchema } },
    },
    async (req, reply) => {
      const dto = await units.create(actorOf(req), req.body);
      return reply.code(201).header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );
  app.patch(
    '/measure-units/:id',
    {
      ...manage,
      schema: {
        tags,
        params: idParams,
        body: updateMeasureUnitSchema,
        response: { 200: measureUnitSchema },
      },
    },
    async (req, reply) => {
      const dto = await units.update(
        actorOf(req),
        req.params.id,
        req.body,
        ifMatchOf(req.headers['if-match']),
      );
      return reply.header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );
  app.delete(
    '/measure-units/:id',
    { ...manage, schema: { tags, params: idParams } },
    async (req, reply) => {
      await units.remove(actorOf(req), req.params.id);
      return reply.code(204).send();
    },
  );

  // --- Consumibles (RF-70) ---
  app.get(
    '/consumables',
    {
      ...read,
      schema: {
        tags,
        querystring: consumableListQuerySchema,
        response: { 200: pageOf(consumableSchema) },
      },
    },
    async (req) => consumables.list(req.query),
  );
  app.get(
    '/consumables/:id',
    { ...read, schema: { tags, params: idParams, response: { 200: consumableDetailSchema } } },
    async (req, reply) => {
      const dto = await consumables.get(req.params.id);
      return reply.header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );
  app.post(
    '/consumables',
    {
      ...manage,
      schema: { tags, body: createConsumableSchema, response: { 201: consumableDetailSchema } },
    },
    async (req, reply) => {
      const dto = await consumables.create(actorOf(req), req.body);
      return reply.code(201).header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );
  app.patch(
    '/consumables/:id',
    {
      ...manage,
      schema: {
        tags,
        params: idParams,
        body: updateConsumableSchema,
        response: { 200: consumableDetailSchema },
      },
    },
    async (req, reply) => {
      const dto = await consumables.update(
        actorOf(req),
        req.params.id,
        req.body,
        ifMatchOf(req.headers['if-match']),
      );
      return reply.header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );
  app.delete(
    '/consumables/:id',
    { ...manage, schema: { tags, params: idParams } },
    async (req, reply) => {
      await consumables.remove(actorOf(req), req.params.id);
      return reply.code(204).send();
    },
  );

  // --- Historial y movimientos (RF-71 a RF-73) ---
  app.get(
    '/consumables/:id/movements',
    {
      ...read,
      schema: {
        tags,
        params: idParams,
        querystring: movementListQuerySchema,
        response: { 200: pageOf(movementSchema) },
      },
    },
    async (req) => consumables.movements(req.params.id, req.query),
  );
  app.post(
    '/consumables/:id/receipts',
    {
      ...requirePermission('consumables:receive'),
      schema: {
        tags,
        params: idParams,
        body: receiptSchema,
        response: { 201: movementResultSchema },
      },
    },
    async (req, reply) =>
      reply.code(201).send(await consumables.receive(actor(req), req.params.id, req.body)),
  );
  app.post(
    '/consumables/:id/deliveries',
    {
      ...requirePermission('consumables:deliver'),
      schema: {
        tags,
        params: idParams,
        body: deliverySchema,
        response: { 201: movementResultSchema },
      },
    },
    async (req, reply) =>
      reply.code(201).send(await consumables.deliver(actor(req), req.params.id, req.body)),
  );
  app.post(
    '/consumables/:id/transfers',
    {
      ...requirePermission('consumables:transfer'),
      schema: {
        tags,
        params: idParams,
        body: transferSchema,
        response: { 201: movementResultSchema },
      },
    },
    async (req, reply) =>
      reply.code(201).send(await consumables.transfer(actor(req), req.params.id, req.body)),
  );
  app.post(
    '/consumables/:id/adjustments',
    {
      ...requirePermission('consumables:adjust'),
      schema: {
        tags,
        params: idParams,
        body: adjustmentSchema,
        response: { 201: movementResultSchema },
      },
    },
    async (req, reply) =>
      reply.code(201).send(await consumables.adjust(actor(req), req.params.id, req.body)),
  );
  app.post(
    '/consumable-movements/:id/reversals',
    {
      ...requirePermission('consumables:adjust'),
      schema: {
        tags,
        params: idParams,
        body: reversalSchema,
        response: { 201: movementResultSchema },
      },
    },
    async (req, reply) =>
      reply.code(201).send(await consumables.reverse(actor(req), req.params.id, req.body)),
  );

  app.get(
    '/consumable-recipients',
    {
      ...requirePermission('consumables:deliver'),
      schema: {
        tags,
        querystring: z.object({ q: z.string().trim().max(100).optional() }),
        response: { 200: z.array(recipientSchema) },
      },
    },
    async (req) => consumables.recipients(req.query.q),
  );
};
