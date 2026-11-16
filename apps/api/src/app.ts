import fastifyCookie from '@fastify/cookie';
import fastifyCsrf from '@fastify/csrf-protection';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import fastifyUnderPressure from '@fastify/under-pressure';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { accessHook, assertRouteDeclaresAccess, type Access } from './core/access.js';
import type { Clock } from './core/clock.js';
import type { AppConfig } from './core/config.js';
import { buildServices } from './core/container.js';
import type { Executor } from './core/db/executor.js';
import { TooManyRequestsError } from './core/errors.js';
import { cookieNames } from './modules/auth/cookies.js';
import type { PasswordHasher } from './modules/auth/password.js';
import { auditRoutes } from './modules/audit/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { assetsRoutes } from './modules/assets/routes.js';
import { catalogRoutes } from './modules/catalog/routes.js';
import { rbacRoutes } from './modules/rbac/routes.js';
import { usersRoutes } from './modules/users/routes.js';
import {
  DomainError,
  NotFoundError,
  badRequestProblem,
  internalProblem,
  toProblem,
} from './core/errors.js';
import { buildLoggerOptions } from './core/logger.js';
import { metricsPlugin } from './core/metrics.js';
import { healthRoutes } from './modules/health/routes.js';
import type { HealthProbes } from './modules/health/service.js';

export interface AppDeps {
  config: AppConfig;
  health: HealthProbes;
  /** Sin `db` solo se montan health/métricas (tests de infraestructura). */
  db?: Executor;
  hasher?: PasswordHasher;
  clock?: Clock;
}

const PROBLEM_JSON = 'application/problem+json';

/** Agrupa los mensajes de validación de Zod por campo. */
function fieldErrorsOf(error: FastifyError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!hasZodFastifySchemaValidationErrors(error)) return out;
  for (const issue of error.validation) {
    const key = issue.instancePath.replace(/^\//, '').replaceAll('/', '.') || '_';
    (out[key] ??= []).push(issue.message ?? 'Valor inválido');
  }
  return out;
}

/**
 * Construye la instancia de Fastify con plugins transversales y módulos.
 * No abre puertos ni conexiones: las dependencias llegan inyectadas.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: buildLoggerOptions(config),
    requestIdHeader: 'x-request-id',
    // Detrás de Caddy; el proxy es de confianza porque Postgres y la API no se exponen fuera de Compose.
    trustProxy: true,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  app.setNotFoundHandler(async (_req, reply) => {
    return reply
      .code(404)
      .type(PROBLEM_JSON)
      .send(toProblem(new NotFoundError('Ruta no encontrada')));
  });

  app.setErrorHandler(async (error: FastifyError, req, reply) => {
    if (error instanceof DomainError) {
      if (error instanceof TooManyRequestsError)
        reply.header('retry-after', String(error.retryAfterSeconds));
      return reply.code(error.status).type(PROBLEM_JSON).send(toProblem(error));
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply
        .code(400)
        .type(PROBLEM_JSON)
        .send(badRequestProblem(fieldErrorsOf(error)));
    }
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply
        .code(status)
        .type(PROBLEM_JSON)
        .send({
          type: 'https://inventarius.local/problems/client-error',
          title:
            status === 429
              ? 'Demasiadas solicitudes'
              : status === 403
                ? 'Sin permiso'
                : 'Solicitud inválida',
          status,
          detail: error.message,
        });
    }
    req.log.error({ err: error }, 'error no controlado');
    const problem = internalProblem();
    return reply
      .code(status === 503 ? 503 : 500)
      .type(PROBLEM_JSON)
      .send({
        ...problem,
        status: status === 503 ? 503 : 500,
      });
  });

  await app.register(fastifyHelmet);
  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, {
    max: config.rateLimitMaxPerMinute,
    timeWindow: '1 minute',
    // Las sondas de salud y métricas no deben consumir el cupo ni bloquearse entre sí.
    allowList: (req) => req.url.startsWith('/api/health') || req.url.startsWith('/api/metrics'),
  });
  const names = cookieNames(config.session.cookieSecure);
  await app.register(fastifyCsrf, {
    sessionPlugin: '@fastify/cookie',
    cookieKey: names.csrf,
    cookieOpts: {
      httpOnly: true,
      secure: config.session.cookieSecure,
      sameSite: 'strict',
      path: '/',
    },
    getToken: (req) => {
      const header = req.headers['x-csrf-token'];
      return typeof header === 'string' ? header : undefined;
    },
  });
  app.decorateRequest('auth', null);
  app.decorate('routeAccess', []);
  await app.register(fastifyUnderPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 1_500_000_000,
    retryAfter: 10,
  });

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Inventarius API', version: '0.0.0' },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(
    async (api) => {
      await api.register(metricsPlugin, { config });
      await api.register(healthRoutes, { probes: deps.health });
      if (deps.db) {
        const services = buildServices({
          db: deps.db,
          config,
          ...(deps.hasher ? { hasher: deps.hasher } : {}),
          ...(deps.clock ? { clock: deps.clock } : {}),
        });
        await api.register(
          async (v1) => {
            v1.addHook('onRoute', assertRouteDeclaresAccess('/api/v1'));
            v1.addHook('onRoute', (route) => {
              const access = (route.config as { access?: Access } | undefined)?.access;
              const methods = Array.isArray(route.method) ? route.method : [route.method];
              if (access)
                for (const method of methods)
                  app.routeAccess.push({ method, url: route.url, access });
            });
            v1.addHook('onRequest', async (req) => {
              req.auth = await services.auth.resolve(req.cookies[names.session]);
            });
            v1.addHook('onRequest', accessHook);
            v1.addHook('preHandler', (req, reply, done) => {
              if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return done();
              app.csrfProtection(req, reply, done);
            });
            await v1.register(authRoutes, { auth: services.auth, config });
            await v1.register(usersRoutes, { users: services.users });
            await v1.register(rbacRoutes, { rbac: services.rbac });
            await v1.register(auditRoutes, { audit: services.audit });
            await v1.register(catalogRoutes, { catalog: services.catalog });
            await v1.register(assetsRoutes, { assets: services.assets });
          },
          { prefix: '/v1' },
        );
      }
      if (!config.isProduction) {
        api.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
      }
    },
    { prefix: '/api' },
  );

  return app;
}
