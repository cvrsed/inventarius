import {
  createUserRequestSchema,
  pageOf,
  pageQuerySchema,
  resetPasswordResponseSchema,
  updateUserRequestSchema,
  userSchema,
} from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../core/access.js';
import { actorOf, ifMatchOf } from '../../core/http.js';
import type { UsersService } from './service.js';

const idParams = z.object({ id: z.uuid() });

export const usersRoutes: FastifyPluginAsyncZod<{ users: UsersService }> = async (app, opts) => {
  const { users } = opts;
  const guard = requirePermission('user:manage');

  app.get(
    '/users',
    {
      ...guard,
      schema: {
        tags: ['users'],
        querystring: pageQuerySchema.extend({ q: z.string().max(100).optional() }),
        response: { 200: pageOf(userSchema) },
      },
    },
    async (req) => users.list(req.query),
  );

  app.get(
    '/users/:id',
    { ...guard, schema: { tags: ['users'], params: idParams, response: { 200: userSchema } } },
    async (req, reply) => {
      const user = await users.get(req.params.id);
      return reply.header('etag', `"${user.updatedAt}"`).send(user);
    },
  );

  app.post(
    '/users',
    {
      ...guard,
      schema: { tags: ['users'], body: createUserRequestSchema, response: { 201: userSchema } },
    },
    async (req, reply) => {
      const user = await users.create(actorOf(req), req.body);
      return reply.code(201).header('etag', `"${user.updatedAt}"`).send(user);
    },
  );

  app.patch(
    '/users/:id',
    {
      ...guard,
      schema: {
        tags: ['users'],
        params: idParams,
        body: updateUserRequestSchema,
        response: { 200: userSchema },
      },
    },
    async (req, reply) => {
      const user = await users.update(
        actorOf(req),
        req.params.id,
        req.body,
        ifMatchOf(req.headers['if-match']),
      );
      return reply.header('etag', `"${user.updatedAt}"`).send(user);
    },
  );

  app.post(
    '/users/:id/reset-password',
    {
      ...guard,
      schema: { tags: ['users'], params: idParams, response: { 200: resetPasswordResponseSchema } },
    },
    async (req, reply) =>
      reply
        .header('cache-control', 'no-store')
        .send(await users.resetPassword(actorOf(req), req.params.id)),
  );
};
