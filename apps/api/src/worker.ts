import { pino } from 'pino';
import { PgBoss } from 'pg-boss';
import { loadConfig } from './core/config.js';
import { buildServices } from './core/container.js';
import { createDb } from './core/db/client.js';
import { buildLoggerOptions } from './core/logger.js';
import { startMaintenanceJobs } from './jobs/maintenance.js';

const config = loadConfig();
const log = pino(buildLoggerOptions(config));

// El esquema de la cola lo instala el paso de migración (usuario migrador); el worker solo opera.
const boss = new PgBoss({
  connectionString: config.databaseUrl,
  migrate: false,
  createSchema: false,
});
boss.on('error', (err) => log.error({ err }, 'error de pg-boss'));

const { pool, db } = createDb(config.databaseUrl);
pool.on('error', (err) => log.error({ err }, 'error en una conexión inactiva de la BD'));
const services = buildServices({ db, config });

await boss.start();
await startMaintenanceJobs(boss, { purgeSessions: () => services.auth.purgeExpired(), log });
log.info('worker iniciado: purga de sesiones cada hora');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'cerrando worker');
    void boss
      .stop({ graceful: true })
      .then(() => pool.end())
      .then(() => process.exit(0));
  });
}
