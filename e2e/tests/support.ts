import AxeBuilder from '@axe-core/playwright';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export const ADMIN = {
  email: process.env['E2E_ADMIN_EMAIL'] ?? 'admin@e2e.test',
  password: process.env['E2E_ADMIN_PASSWORD'] ?? '',
};
export const STRONG_PASSWORD = 'violeta-cobre-nube-87';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * axe mide el color renderizado: en mitad de una transición (p. ej. el fundido de un mensaje) lee tonos
 * intermedios y da falsos positivos de contraste. Se congelan transiciones y animaciones antes de medir.
 */
export async function expectNoA11yViolations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

export const uniqueEmail = (prefix: string): string =>
  `${prefix}-${randomUUID().slice(0, 8)}@e2e.test`;

/** Token CSRF y cookie de secreto en el contexto de la petición. */
async function csrf(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/v1/auth/csrf');
  return ((await res.json()) as { token: string }).token;
}

/** Inicia sesión por API: las cookies quedan en el contexto del navegador (comparte jar con `page`). */
export async function loginViaApi(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const token = await csrf(request);
  const res = await request.post('/api/v1/auth/login', {
    data: { email, password },
    headers: { 'x-csrf-token': token },
  });
  expect(res.status(), await res.text()).toBe(200);
}

export async function apiPost<T>(
  request: APIRequestContext,
  url: string,
  data?: unknown,
): Promise<T> {
  const token = await csrf(request);
  const res = await request.post(url, {
    ...(data !== undefined ? { data } : {}),
    headers: { 'x-csrf-token': token },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
  return (await res.json()) as T;
}

/**
 * Crea un usuario (como administrador) y lo deja listo: contraseña definitiva ya elegida.
 * Usa un contexto de petición aparte para no pisar la sesión del administrador.
 */
export async function provisionUser(
  admin: APIRequestContext,
  newContext: () => Promise<APIRequestContext>,
  opts: { role: string; prefix?: string },
): Promise<{ email: string; password: string }> {
  const email = uniqueEmail(opts.prefix ?? 'user');
  const roles = (await (await admin.get('/api/v1/roles')).json()) as { id: string; name: string }[];
  const roleId = roles.find((r) => r.name === opts.role)!.id;
  await apiPost(admin, '/api/v1/users', {
    email,
    name: `Persona ${email.split('@')[0]}`,
    roleIds: [roleId],
    password: 'inicial-temporal-clave-1',
  });

  const own = await newContext();
  await loginViaApi(own, email, 'inicial-temporal-clave-1');
  await apiPost(own, '/api/v1/auth/change-password', {
    currentPassword: 'inicial-temporal-clave-1',
    newPassword: STRONG_PASSWORD,
  });
  await own.dispose();
  return { email, password: STRONG_PASSWORD };
}

export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

export const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
