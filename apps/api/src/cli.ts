import { createInterface } from 'node:readline/promises';
import { buildServices } from './core/container.js';
import { loadConfig } from './core/config.js';
import { createDb } from './core/db/client.js';
import { ConflictError, DomainError } from './core/errors.js';
import { createAdminInput, updateEmailInput } from './cli-args.js';
import { describeLedgerReport } from './modules/consumables/verify.js';

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
 * CLI de operación. Comandos:
 *   create-admin --email <correo> --name <nombre> [--password-env VAR] [--if-missing]
 *   update-email --email-actual <correo> --email-nuevo <correo>
 *   reencrypt-secrets
 *   verify-consumables
 * `reencrypt-secrets` recifra AppKey, NwkKey y credenciales LNS con la clave vigente (rotación de APP_ENCRYPTION_KEY).
 * `verify-consumables` comprueba que el saldo de cada consumible y bodega es igual a la suma del libro de movimientos
 * (sale con código 1 si algo no cuadra). Solo lee.
 * `update-email` cambia el correo de cualquier usuario (también el del único administrador): cierra sus sesiones y
 * deja la auditoría con actor `cli`.
 * La contraseña nunca va por argumentos (quedaría en el historial del shell): se lee de una variable
 * de entorno indicada con --password-env o se pide de forma interactiva.
 * Con --if-missing, un correo ya existente no es error (útil para automatizar despliegues).
 */
async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'create-admin') return createAdmin(rest);
  if (command === 'update-email') return updateEmail(rest);
  if (command === 'reencrypt-secrets') return reencryptSecrets();
  if (command === 'verify-consumables') return verifyConsumables();
  console.error(
    'Uso:\n  cli create-admin --email <correo> --name <nombre> [--password-env VAR] [--if-missing]\n' +
      '  cli update-email --email-actual <correo> --email-nuevo <correo>\n' +
      '  cli reencrypt-secrets\n' +
      '  cli verify-consumables',
  );
  return 2;
}

/** Ejecuta una operación contra la BD e imprime los errores del dominio sin volcar la traza. */
async function withServices(
  run: (services: ReturnType<typeof buildServices>) => Promise<number>,
  onConflict?: () => number,
): Promise<number> {
  const config = loadConfig();
  const handle = createDb(config.databaseUrl, config.db);
  try {
    return await run(buildServices({ db: handle.db, config }));
  } catch (e) {
    if (e instanceof ConflictError && onConflict) return onConflict();
    if (e instanceof DomainError) {
      const detail = e.fieldErrors ? ` (${Object.values(e.fieldErrors).flat().join('; ')})` : '';
      console.error(`${e.message}${detail}`);
      return 1;
    }
    throw e;
  } finally {
    await handle.close();
  }
}

async function createAdmin(rest: string[]): Promise<number> {
  const input = await createAdminInput(rest, process.env, {
    email: () => ask('Correo: '),
    name: () => ask('Nombre: '),
    password: () => ask('Contraseña (mín. 12 caracteres): ', true),
  });
  return withServices(
    async ({ users }) => {
      const created = await users.createInitialAdmin(input);
      console.info(`Administrador creado: ${created.email}`);
      return 0;
    },
    rest.includes('--if-missing')
      ? () => {
          console.info(`El usuario ${input.email} ya existe; no se hace nada.`);
          return 0;
        }
      : undefined,
  );
}

async function updateEmail(rest: string[]): Promise<number> {
  let input: ReturnType<typeof updateEmailInput>;
  try {
    input = updateEmailInput(rest);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }
  return withServices(async ({ users }) => {
    const updated = await users.changeEmailByCli(input.currentEmail, input.newEmail);
    console.info(
      `Correo actualizado: ${input.currentEmail} → ${updated.email}. Se cerraron las sesiones de esa persona.`,
    );
    return 0;
  });
}

async function reencryptSecrets(): Promise<number> {
  return withServices(async ({ lorawan, lnsProfiles }) => {
    const keys = await lorawan.reencryptAll();
    const credentials = await lnsProfiles.reencryptAll();
    console.info(
      `Recifrado con la clave vigente: ${keys} dispositivos LoRaWAN y ${credentials} perfiles LNS.`,
    );
    return 0;
  });
}

async function verifyConsumables(): Promise<number> {
  return withServices(async ({ consumables }) => {
    const mismatches = await consumables.verifyLedger();
    console.info(describeLedgerReport(mismatches));
    return mismatches.length ? 1 : 0;
  });
}

process.exitCode = await main();
