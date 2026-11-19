import { pino } from 'pino';
import { PgBoss } from 'pg-boss';
import { loadConfig } from './core/config.js';
import { buildServices } from './core/container.js';
import { shutdown } from './core/shutdown.js';
import { createDb } from './core/db/client.js';
import { buildLoggerOptions } from './core/logger.js';
import { startMaintenanceJobs } from './jobs/maintenance.js';
import { startLnsJobs } from './jobs/lns.js';
import { PgBossQueue } from './core/queue.js';

const config = loadConfig();
const log = pino(buildLoggerOptions(config));

// El esquema de la cola lo instala el paso de migración (usuario migrador); el worker solo opera.
const boss = new PgBoss({
  connectionString: config.databaseUrl,
  migrate: false,
  createSchema: false,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
});
boss.on('error', (err) => log.error({ err }, 'error de pg-boss'));

const { pool, db } = createDb(config.databaseUrl, config.db);
pool.on('error', (err) => log.error({ err }, 'error en una conexión inactiva de la BD'));
const services = buildServices({ db, config, queue: new PgBossQueue(boss), log });

await boss.start();
await startMaintenanceJobs(boss, { purgeSessions: () => services.auth.purgeExpired(), log });
await startLnsJobs(boss, services.registrations, log);
log.info('worker iniciado: purga de sesiones cada hora y registro en LNS');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'cerrando worker');
    void shutdown(
      async () => {
        await boss.stop({ graceful: true, timeout: config.shutdownTimeoutMs });
        await pool.end();
      },
      { timeoutMs: config.shutdownTimeoutMs, log, exit: (code) => process.exit(code) },
    );
  });
}
