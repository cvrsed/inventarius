import { buildApp } from './app.js';
import { loadConfig } from './core/config.js';
import { shutdown } from './core/shutdown.js';
import { PgBoss } from 'pg-boss';
import { PgBossQueue } from './core/queue.js';
import { createDb, pingDatabase, pingQueue } from './core/db/client.js';

const config = loadConfig();
const { pool, db, close } = createDb(config.databaseUrl, config.db);

// La API solo encola (el esquema de la cola lo instala el migrador y el worker atiende los jobs).
const boss = new PgBoss({
  connectionString: config.databaseUrl,
  migrate: false,
  createSchema: false,
  supervise: false,
  schedule: false,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
});
boss.on('error', (err) => process.stderr.write(`error de pg-boss: ${String(err)}\n`));
await boss.start();

const app = await buildApp({
  config,
  db,
  queue: new PgBossQueue(boss),
  health: { database: () => pingDatabase(pool), queue: () => pingQueue(pool) },
});

// Sin este handler, un cierre de conexión inactiva (p. ej. reinicio de Postgres) tira el proceso.
pool.on('error', (err) => app.log.error({ err }, 'error en una conexión inactiva de la BD'));

app.addHook('onClose', async () => {
  await boss.stop({ graceful: true, timeout: config.shutdownTimeoutMs });
  await close();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'cerrando');
    void shutdown(() => app.close(), {
      timeoutMs: config.shutdownTimeoutMs,
      log: app.log,
      exit: (code) => process.exit(code),
    });
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error({ err }, 'no se pudo iniciar el servidor');
  process.exit(1);
}
