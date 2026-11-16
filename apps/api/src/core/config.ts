import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_TIMEZONE: z.string().min(1).default('America/Santiago'),
  DATABASE_URL: z.string().min(1),
  MIGRATION_DATABASE_URL: z.string().min(1).optional(),
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
  };
}
