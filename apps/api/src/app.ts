import fastifyHelmet from '@fastify/helmet';
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
import type { AppConfig } from './core/config.js';
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
      return reply.code(status).type(PROBLEM_JSON).send({
        type: 'https://inventarius.local/problems/client-error',
        title: 'Solicitud inválida',
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
      if (!config.isProduction) {
        api.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());
      }
    },
    { prefix: '/api' },
  );

  return app;
}
