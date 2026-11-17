import {
  changePasswordRequestSchema,
  csrfResponseSchema,
  loginRequestSchema,
  sessionUserSchema,
} from '@inventarius/shared';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { authenticatedRoute, publicRoute } from '../../core/access.js';
import type { AppConfig } from '../../core/config.js';
import { UnauthorizedError } from '../../core/errors.js';
import { actorOf } from '../../core/http.js';
import type { AuthService, ClientInfo } from './service.js';
import { csrfToken, newAnonymousBinding } from './csrf.js';
import { cookieNames, setSessionCookie, clearSessionCookie } from './cookies.js';

export interface AuthRoutesOptions {
  auth: AuthService;
  config: AppConfig;
}

export const authRoutes: FastifyPluginAsyncZod<AuthRoutesOptions> = async (app, opts) => {
  const { auth, config } = opts;
  const names = cookieNames(config.session.cookieSecure);

  const client = (req: { ip: string; headers: Record<string, unknown> }): ClientInfo => ({
    ip: req.ip,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
  });

  const startSession = (reply: FastifyReply, token: string) =>
    setSessionCookie(reply, names.session, token, config);

  /** Entrega un token CSRF firmado (HMAC) y ligado a la sesión, o a una cookie anónima si aún no hay sesión. */
  app.get(
    '/auth/csrf',
    { ...publicRoute(), schema: { tags: ['auth'], response: { 200: csrfResponseSchema } } },
    async (req, reply) => {
      // Con sesión, el token queda ligado a su id; sin ella, a una cookie anónima que se crea aquí si falta.
      let binding = req.auth?.sessionId;
      if (!binding) {
        binding = req.cookies[names.csrf] || newAnonymousBinding();
        reply.setCookie(names.csrf, binding, {
          httpOnly: true,
          secure: config.session.cookieSecure,
          sameSite: 'strict',
          path: '/',
        });
      }
      return reply
        .header('cache-control', 'no-store')
        .send({ token: csrfToken(config.csrfSecret, binding) });
    },
  );

  app.post(
    '/auth/login',
    {
      ...publicRoute(),
      config: {
        ...publicRoute().config,
        rateLimit: { max: config.login.rateLimitPerMinute, timeWindow: '1 minute' },
      },
      schema: { tags: ['auth'], body: loginRequestSchema, response: { 200: sessionUserSchema } },
    },
    async (req, reply) => {
      const { token, user } = await auth.login(req.body, client(req), req.auth?.sessionId);
      startSession(reply, token);
      return reply.header('cache-control', 'no-store').send(user);
    },
  );

  app.post(
    '/auth/logout',
    {
      ...authenticatedRoute({ allowPendingPasswordChange: true }),
      schema: { tags: ['auth'], response: { 204: z.null() } },
    },
    async (req, reply) => {
      if (!req.auth) throw new UnauthorizedError();
      await auth.logout(actorOf(req), req.auth.sessionId);
      clearSessionCookie(reply, names.session, config);
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      ...authenticatedRoute({ allowPendingPasswordChange: true }),
      schema: { tags: ['auth'], response: { 200: sessionUserSchema } },
    },
    async (req, reply) => {
      if (!req.auth) throw new UnauthorizedError();
      return reply.header('cache-control', 'no-store').send(req.auth.user);
    },
  );

  app.post(
    '/auth/change-password',
    {
      ...authenticatedRoute({ allowPendingPasswordChange: true }),
      schema: {
        tags: ['auth'],
        body: changePasswordRequestSchema,
        response: { 200: sessionUserSchema },
      },
    },
    async (req, reply) => {
      if (!req.auth) throw new UnauthorizedError();
      const { token, user } = await auth.changePassword(req.auth, req.body, client(req));
      startSession(reply, token);
      return reply.header('cache-control', 'no-store').send(user);
    },
  );
};
