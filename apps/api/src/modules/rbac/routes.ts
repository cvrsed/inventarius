import {
  createRoleRequestSchema,
  permissionSchema,
  roleSchema,
  updateRoleRequestSchema,
} from '@inventarius/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePermission } from '../../core/access.js';
import { actorOf, ifMatchOf } from '../../core/http.js';
import { versionOf, type RbacService } from './service.js';

const idParams = z.object({ id: z.uuid() });

export const rbacRoutes: FastifyPluginAsyncZod<{ rbac: RbacService }> = async (app, opts) => {
  const { rbac } = opts;

  // Quien gestiona usuarios necesita ver los roles para asignarlos.
  app.get(
    '/roles',
    {
      ...requirePermission('user:manage', 'role:manage'),
      schema: { tags: ['roles'], response: { 200: z.array(roleSchema) } },
    },
    async () => rbac.listRoles(),
  );

  app.get(
    '/permissions',
    {
      ...requirePermission('role:manage'),
      schema: { tags: ['roles'], response: { 200: z.array(permissionSchema) } },
    },
    async () => [...rbac.listPermissions()],
  );

  app.post(
    '/roles',
    {
      ...requirePermission('role:manage'),
      schema: { tags: ['roles'], body: createRoleRequestSchema, response: { 201: roleSchema } },
    },
    async (req, reply) => {
      const role = await rbac.createRole(actorOf(req), req.body);
      return reply.code(201).header('etag', `"${role.updatedAt}"`).send(role);
    },
  );

  app.patch(
    '/roles/:id',
    {
      ...requirePermission('role:manage'),
      schema: {
        tags: ['roles'],
        params: idParams,
        body: updateRoleRequestSchema,
        response: { 200: roleSchema },
      },
    },
    async (req, reply) => {
      const version = ifMatchOf(req.headers['if-match']);
      const role = await rbac.updateRole(actorOf(req), req.params.id, req.body, version);
      return reply.header('etag', `"${versionOf(new Date(role.updatedAt))}"`).send(role);
    },
  );

  app.delete(
    '/roles/:id',
    {
      ...requirePermission('role:manage'),
      schema: { tags: ['roles'], params: idParams, response: { 204: z.null() } },
    },
    async (req, reply) => {
      await rbac.deleteRole(actorOf(req), req.params.id);
      return reply.code(204).send(null);
    },
  );
};
