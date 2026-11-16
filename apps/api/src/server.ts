import { buildApp } from './app.js';
import { loadConfig } from './core/config.js';
import { createDb, pingDatabase, pingQueue } from './core/db/client.js';

const config = loadConfig();
const { pool, db, close } = createDb(config.databaseUrl);

const app = await buildApp({
  config,
  db,
  health: { database: () => pingDatabase(pool), queue: () => pingQueue(pool) },
});

// Sin este handler, un cierre de conexión inactiva (p. ej. reinicio de Postgres) tira el proceso.
pool.on('error', (err) => app.log.error({ err }, 'error en una conexión inactiva de la BD'));

app.addHook('onClose', async () => close());

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'cerrando');
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  app.log.error({ err }, 'no se pudo iniciar el servidor');
  process.exit(1);
}
