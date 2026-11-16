import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_TIMEZONE: z.string().min(1).default('America/Santiago'),
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
  databaseUrl: string;
  migrationDatabaseUrl: string | undefined;
  metricsToken: string | undefined;
  assetTagPrefix: string;
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
  return {
    nodeEnv: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    logLevel: e.LOG_LEVEL,
    host: e.HOST,
    port: e.PORT,
    timezone: e.APP_TIMEZONE,
    databaseUrl: e.DATABASE_URL,
    migrationDatabaseUrl: e.MIGRATION_DATABASE_URL,
    metricsToken: e.METRICS_TOKEN,
    assetTagPrefix: e.ASSET_TAG_PREFIX,
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
