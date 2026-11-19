import { currencySchema, type Currency } from '@inventarius/shared';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import type { DbTimeouts } from './db/timeouts.js';
import { z } from 'zod';

/** Palabras que `proxy-addr` (Fastify) entiende además de IP y CIDR. */
const PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

/** `true` si es una IP, una IP/prefijo o una de las palabras de `proxy-addr`. */
function isProxyEntry(entry: string): boolean {
  if (PROXY_KEYWORDS.has(entry)) return true;
  const [ip, prefix, ...rest] = entry.split('/');
  if (rest.length > 0 || !ip) return false;
  const version = isIP(ip);
  if (version === 0) return false;
  if (prefix === undefined) return true;
  const max = version === 4 ? 32 : 128;
  return /^\d+$/.test(prefix) && Number(prefix) <= max;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Zona en que la web muestra las fechas (se guardan en UTC, RNF-05). */
  APP_TIMEZONE: z
    .string()
    .min(1)
    .default('America/Santiago')
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('es-CL', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, 'zona horaria IANA inválida (p. ej. America/Santiago)'),
  /**
   * Proxies inversos de los que se acepta `X-Forwarded-For` (RF-30): IPs, CIDR o `loopback`, `linklocal`,
   * `uniquelocal`, separados por coma. De cualquier otro origen se usa la IP del socket. En producción conviene
   * acotarlo a la IP de Caddy; el valor por defecto cubre localhost y las redes privadas de Compose.
   */
  TRUSTED_PROXIES: z
    .string()
    .default('loopback,uniquelocal')
    .transform((v) =>
      v
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .refine(
      (list) => list.every(isProxyEntry),
      'lista de IP/CIDR (o loopback, linklocal, uniquelocal)',
    ),
  /** Milisegundos; `0` desactiva el tope (como en PostgreSQL). */
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(0).default(5_000),
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(0).default(30_000),
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: z.coerce.number().int().min(0).default(30_000),
  /** Tiempo máximo del apagado ordenado de la API y del worker; pasado ese tope el proceso termina igual. */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /**
   * Secreto con el que se firman los tokens CSRF (HMAC). Obligatorio en producción (debe ser el mismo en todas las
   * instancias); fuera de ella, si falta, se genera uno aleatorio por proceso. Mínimo 32 caracteres.
   */
  CSRF_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(32, 'mínimo 32 caracteres').optional(),
  ),
  DATABASE_URL: z.string().min(1),
  MIGRATION_DATABASE_URL: z.string().min(1).optional(),
  SESSION_IDLE_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(8 * 3600),
  SESSION_ABSOLUTE_TIMEOUT_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 3600),
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  LOGIN_MAX_FAILURES_PER_ACCOUNT: z.coerce.number().int().positive().default(5),
  LOGIN_MAX_FAILURES_PER_IP: z.coerce.number().int().positive().default(20),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  LOGIN_LOCK_BASE_SECONDS: z.coerce.number().int().positive().default(60),
  LOGIN_LOCK_MAX_SECONDS: z.coerce.number().int().positive().default(1800),
  RATE_LIMIT_MAX_PER_MINUTE: z.coerce.number().int().positive().default(600),
  /** Prefijo de las etiquetas autogeneradas de activos: `INV` -> `INV-000123` (D6). */
  ASSET_TAG_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9]{1,10}$/, 'letras y números, hasta 10 caracteres')
    .default('INV'),
  /** Moneda que se propone para el costo de compra de los activos. */
  DEFAULT_CURRENCY: currencySchema.default('CLP'),
  METRICS_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v)),
});

/** Configuración tipada de la aplicación, ya validada. */
export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  isProduction: boolean;
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  host: string;
  port: number;
  timezone: string;
  /** Proxies de confianza para `X-Forwarded-For`; vacío = no confiar en ninguno. */
  trustedProxies: string[];
  databaseUrl: string;
  /** Secreto de firma de los tokens CSRF. */
  csrfSecret: string;
  /** Topes de la conexión a la BD de la API, el worker y el CLI (ms; 0 = sin tope). */
  db: DbTimeouts;
  shutdownTimeoutMs: number;
  migrationDatabaseUrl: string | undefined;
  metricsToken: string | undefined;
  assetTagPrefix: string;
  defaultCurrency: Currency;
  session: {
    idleTimeoutSeconds: number;
    absoluteTimeoutSeconds: number;
    /** Con `Secure` la cookie usa el prefijo `__Host-`; requiere HTTPS (o localhost). */
    cookieSecure: boolean;
  };
  login: {
    maxFailuresPerAccount: number;
    maxFailuresPerIp: number;
    lockBaseSeconds: number;
    lockMaxSeconds: number;
    /** Peticiones de login por minuto y por IP (rate limit HTTP, aparte del bloqueo por fallos). */
    rateLimitPerMinute: number;
  };
  rateLimitMaxPerMinute: number;
}

/**
 * Lee y valida las variables de entorno. Es el único lugar que toca `process.env`:
 * si falta algo o es inválido, lanza un error con la lista de variables para que la app no arranque.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Configuración inválida: ${detail}`);
  }
  const e = parsed.data;
  if (e.NODE_ENV === 'production' && !e.CSRF_SECRET) {
    throw new Error(
      'Configuración inválida: CSRF_SECRET: obligatorio en producción (mínimo 32 caracteres)',
    );
  }
  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    logLevel: e.LOG_LEVEL,
    host: e.HOST,
    port: e.PORT,
    timezone: e.APP_TIMEZONE,
    trustedProxies: e.TRUSTED_PROXIES,
    databaseUrl: e.DATABASE_URL,
    csrfSecret: e.CSRF_SECRET ?? randomBytes(32).toString('hex'),
    db: {
      connectionTimeoutMs: e.DB_CONNECTION_TIMEOUT_MS,
      statementTimeoutMs: e.DB_STATEMENT_TIMEOUT_MS,
      idleInTransactionTimeoutMs: e.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    },
    shutdownTimeoutMs: e.SHUTDOWN_TIMEOUT_MS,
    migrationDatabaseUrl: e.MIGRATION_DATABASE_URL,
    metricsToken: e.METRICS_TOKEN,
    assetTagPrefix: e.ASSET_TAG_PREFIX,
    defaultCurrency: e.DEFAULT_CURRENCY,
    session: {
      idleTimeoutSeconds: e.SESSION_IDLE_TIMEOUT_SECONDS,
      absoluteTimeoutSeconds: e.SESSION_ABSOLUTE_TIMEOUT_SECONDS,
      cookieSecure: e.SESSION_COOKIE_SECURE
        ? e.SESSION_COOKIE_SECURE === 'true'
        : e.NODE_ENV === 'production',
    },
    login: {
      maxFailuresPerAccount: e.LOGIN_MAX_FAILURES_PER_ACCOUNT,
      maxFailuresPerIp: e.LOGIN_MAX_FAILURES_PER_IP,
      lockBaseSeconds: e.LOGIN_LOCK_BASE_SECONDS,
      lockMaxSeconds: e.LOGIN_LOCK_MAX_SECONDS,
      rateLimitPerMinute: e.LOGIN_RATE_LIMIT_PER_MINUTE,
    },
    rateLimitMaxPerMinute: e.RATE_LIMIT_MAX_PER_MINUTE,
  };
}
