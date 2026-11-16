import { emailSchema } from '@inventarius/shared';

export interface Prompts {
  email(): Promise<string>;
  name(): Promise<string>;
  password(): Promise<string>;
}

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Resuelve los datos del primer administrador desde argumentos, entorno o preguntas interactivas. */
export async function createAdminInput(
  args: string[],
  env: Record<string, string | undefined>,
  prompts: Prompts,
): Promise<{ email: string; name: string; password: string }> {
  if (args.includes('--password')) {
    throw new Error(
      'No se acepta --password (quedaría en el historial del shell). Usa --password-env VARIABLE o la pregunta interactiva.',
    );
  }
  const rawEmail = flag(args, 'email') ?? (await prompts.email());
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success) throw new Error(`El correo indicado no es válido: ${rawEmail}`);

  const name = (flag(args, 'name') ?? (await prompts.name())).trim();
  if (!name) throw new Error('El nombre no puede estar vacío');

  const envName = flag(args, 'password-env');
  let password: string;
  if (envName) {
    const value = env[envName];
    if (!value) throw new Error(`La variable de entorno ${envName} no está definida`);
    password = value;
  } else {
    password = await prompts.password();
  }
  return { email: email.data, name, password };
}

/** Resuelve el correo actual y el nuevo de `update-email`; ambos son obligatorios y se normalizan. */
export function updateEmailInput(args: string[]): { currentEmail: string; newEmail: string } {
  const parse = (name: 'email-actual' | 'email-nuevo'): string => {
    const raw = flag(args, name);
    if (!raw) throw new Error(`Falta --${name}`);
    const email = emailSchema.safeParse(raw);
    if (!email.success) throw new Error(`El correo indicado en --${name} no es válido: ${raw}`);
    return email.data;
  };
  return { currentEmail: parse('email-actual'), newEmail: parse('email-nuevo') };
}
