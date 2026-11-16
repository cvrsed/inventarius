import { createInterface } from 'node:readline/promises';
import { buildServices } from './core/container.js';
import { loadConfig } from './core/config.js';
import { createDb } from './core/db/client.js';
import { ConflictError, DomainError } from './core/errors.js';
import { createAdminInput } from './cli-args.js';

async function ask(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  if (hidden) {
    // Sin eco de la contraseña en la terminal.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => undefined;
  }
  process.stdout.write(question);
  const answer = await rl.question('');
  rl.close();
  if (hidden) process.stdout.write('\n');
  return answer;
}

/**
 * CLI de operación. Comando actual:
 *   create-admin --email <correo> --name <nombre> [--password-env VAR]
 * La contraseña nunca va por argumentos (quedaría en el historial del shell): se lee de una variable
 * de entorno indicada con --password-env o se pide de forma interactiva.
 */
async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'create-admin') {
    console.error('Uso: cli create-admin --email <correo> --name <nombre> [--password-env VAR]');
    return 2;
  }
  const parsed = createAdminInput(rest, process.env, {
    email: () => ask('Correo: '),
    name: () => ask('Nombre: '),
    password: () => ask('Contraseña (mín. 12 caracteres): ', true),
  });
  const input = await parsed;

  const config = loadConfig();
  const handle = createDb(config.databaseUrl);
  try {
    const { users } = buildServices({ db: handle.db, config });
    const created = await users.createInitialAdmin(input);
    console.info(`Administrador creado: ${created.email}`);
    return 0;
  } catch (e) {
    if (e instanceof ConflictError || e instanceof DomainError) {
      const detail = e.fieldErrors ? ` (${Object.values(e.fieldErrors).flat().join('; ')})` : '';
      console.error(`${e.message}${detail}`);
      return 1;
    }
    throw e;
  } finally {
    await handle.close();
  }
}

process.exitCode = await main();
