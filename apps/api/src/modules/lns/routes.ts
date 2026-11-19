import {
  connectionCheckSchema,
  createLnsProfileSchema,
  lnsProfileSchema,
  lnsRegistrationSchema,
  lnsKindSchema,
  pageOf,
  pageQuerySchema,
  registerInLnsSchema,
  registrationPreviewSchema,
  resolveConflictSchema,
  updateLnsProfileSchema,
} from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../core/access.js';
import { actorOf, ifMatchOf } from '../../core/http.js';
import type { LnsProfilesService } from './profiles-service.js';
import type { RegistrationService } from './registration-service.js';

const idParams = z.object({ id: z.uuid() });
const tags = ['lns'];
const profileOption = z.object({ id: z.uuid(), name: z.string(), kind: lnsKindSchema });

/** Perfiles LNS (RF-50 a RF-52) y registro de activos en el LNS (RF-60 a RF-65). */
export const lnsRoutes: FastifyPluginAsyncZod<{
  profiles: LnsProfilesService;
  registrations: RegistrationService;
}> = async (app, opts) => {
  const { profiles, registrations } = opts;
  const manage = requirePermission('lns_profile:manage');
  const register = requirePermission('lorawan:register');

  app.get(
    '/lns-profiles',
    {
      ...manage,
      schema: {
        tags,
        querystring: pageQuerySchema.extend({ q: z.string().trim().max(100).optional() }),
        response: { 200: pageOf(lnsProfileSchema) },
      },
    },
    async (req) => profiles.list(req.query),
  );

  // Perfiles activos para el diálogo «Registrar en LNS»: quien registra no necesita administrarlos.
  app.get(
    '/lns-profiles/options',
    { ...register, schema: { tags, response: { 200: z.array(profileOption) } } },
    async () => {
      const { data } = await profiles.list({ activeOnly: true, page: 1, pageSize: 100 });
      return data.map(({ id, name, kind }) => ({ id, name, kind }));
    },
  );

  app.get(
    '/lns-profiles/:id',
    { ...manage, schema: { tags, params: idParams, response: { 200: lnsProfileSchema } } },
    async (req, reply) => {
      const dto = await profiles.get(req.params.id);
      return reply.header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );

  app.post(
    '/lns-profiles',
    {
      ...manage,
      schema: { tags, body: createLnsProfileSchema, response: { 201: lnsProfileSchema } },
    },
    async (req, reply) => {
      const dto = await profiles.create(actorOf(req), req.body);
      return reply.code(201).header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );

  app.patch(
    '/lns-profiles/:id',
    {
      ...manage,
      schema: {
        tags,
        params: idParams,
        body: updateLnsProfileSchema,
        response: { 200: lnsProfileSchema },
      },
    },
    async (req, reply) => {
      const dto = await profiles.update(
        actorOf(req),
        req.params.id,
        req.body,
        ifMatchOf(req.headers['if-match']),
      );
      return reply.header('etag', `"${dto.updatedAt}"`).send(dto);
    },
  );

  app.delete(
    '/lns-profiles/:id',
    { ...manage, schema: { tags, params: idParams } },
    async (req, reply) => {
      await profiles.remove(actorOf(req), req.params.id);
      return reply.code(204).send();
    },
  );

  app.post(
    '/lns-profiles/:id/test',
    { ...manage, schema: { tags, params: idParams, response: { 200: connectionCheckSchema } } },
    async (req) => profiles.testConnection(req.params.id),
  );

  const base = '/assets/:id/lns-registration';

  app.post(
    `${base}/preview`,
    {
      ...register,
      schema: {
        tags,
        params: idParams,
        body: registerInLnsSchema,
        response: { 200: registrationPreviewSchema },
      },
    },
    async (req) => registrations.preview(req.params.id, req.body.profileId),
  );

  app.post(
    base,
    {
      ...register,
      schema: {
        tags,
        params: idParams,
        body: registerInLnsSchema,
        response: { 202: lnsRegistrationSchema },
      },
    },
    async (req, reply) =>
      reply
        .code(202)
        .send(await registrations.request(actorOf(req), req.params.id, req.body.profileId)),
  );

  app.delete(
    base,
    {
      ...register,
      schema: { tags, params: idParams, response: { 202: lnsRegistrationSchema.nullable() } },
    },
    async (req, reply) =>
      reply.code(202).send(await registrations.deregister(actorOf(req), req.params.id)),
  );

  app.post(
    `${base}/retry`,
    { ...register, schema: { tags, params: idParams, response: { 202: lnsRegistrationSchema } } },
    async (req, reply) =>
      reply.code(202).send(await registrations.retry(actorOf(req), req.params.id)),
  );

  app.post(
    `${base}/resolve`,
    {
      ...register,
      schema: {
        tags,
        params: idParams,
        body: resolveConflictSchema,
        response: { 200: lnsRegistrationSchema.nullable() },
      },
    },
    async (req) => registrations.resolveConflict(actorOf(req), req.params.id, req.body.action),
  );
};
