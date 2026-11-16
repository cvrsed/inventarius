import { loadConfig } from './core/config.js';
import { runMigrations } from './core/db/migrator.js';

const config = loadConfig();
const url = config.migrationDatabaseUrl;
if (!url) {
  console.error('Falta MIGRATION_DATABASE_URL para aplicar migraciones.');
  process.exit(1);
}

await runMigrations(url);
console.info('Migraciones aplicadas.');
