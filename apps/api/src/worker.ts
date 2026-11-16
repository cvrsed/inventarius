import { pino } from 'pino';
import { PgBoss } from 'pg-boss';
import { loadConfig } from './core/config.js';
import { buildLoggerOptions } from './core/logger.js';

const config = loadConfig();
const log = pino(buildLoggerOptions(config));

// El esquema de la cola lo instala el paso de migración (usuario migrador); el worker solo opera.
const boss = new PgBoss({
  connectionString: config.databaseUrl,
  migrate: false,
  createSchema: false,
});
boss.on('error', (err) => log.error({ err }, 'error de pg-boss'));

await boss.start();
log.info('worker iniciado (sin handlers hasta F3)');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'cerrando worker');
    void boss.stop({ graceful: true }).then(() => process.exit(0));
  });
}
