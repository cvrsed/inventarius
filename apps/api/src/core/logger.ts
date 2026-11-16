import type { LoggerOptions } from 'pino';
import type { AppConfig } from './config.js';

/** Rutas que pino censura siempre (sección 10.1: nada de claves, tokens ni cookies en logs). */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.headers["x-csrf-token"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.apiKey',
  '*.api_key',
  '*.appKey',
  '*.app_key',
  '*.nwkKey',
  '*.nwk_key',
  '*.credential',
  '*.secret',
];

/** Opciones de pino para Fastify: JSON a stdout con censura de secretos. */
export function buildLoggerOptions(config: AppConfig): LoggerOptions {
  return {
    level: config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: 'inventarius' },
  };
}
