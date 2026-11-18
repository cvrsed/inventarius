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
  // Con un listbox abierto el fondo pasa a `inert` un instante después de mostrarse (useInertWhileOpen); medir antes da un
  // falso `aria-hidden-focus` (enlace de salto). Se espera a que el fondo esté inerte.
  if (await page.getByRole('listbox').isVisible()) {
    // (en un diálogo modal el select no marca `inert`: ahí no se espera, y axe decide.)
    await expect(page.locator('#app'))
      .toHaveAttribute('inert', '', { timeout: 1500 })
      .catch(() => undefined);
  }
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

export const uniqueEmail = (prefix: string): string =>
  `${prefix}-${randomUUID().slice(0, 8)}@e2e.test`;

/** PATCH con `If-Match` tomado del activo actual; devuelve el activo actualizado. */
export async function apiPatchAsset(
  request: APIRequestContext,
  id: string,
  data: Record<string, unknown>,
): Promise<{ updatedAt: string }> {
  const current = (await (await request.get(`/api/v1/assets/${id}`)).json()) as {
    updatedAt: string;
  };
  const res = await request.patch(`/api/v1/assets/${id}`, {
    data,
    headers: { 'x-csrf-token': await csrf(request), 'if-match': `"${current.updatedAt}"` },
  });
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as { updatedAt: string };
}

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

/** DELETE con cuerpo JSON (p. ej. la baja de un activo con su motivo). */
export async function apiDelete(
  request: APIRequestContext,
  url: string,
  data?: unknown,
): Promise<void> {
  const res = await request.delete(url, {
    ...(data !== undefined ? { data } : {}),
    headers: { 'x-csrf-token': await csrf(request) },
  });
  expect(res.status(), await res.text()).toBeLessThan(300);
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
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

export const horizontalOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

/** Nombre único para datos de prueba: la base de e2e es compartida y los tests corren en paralelo. */
export const uniqueName = (prefix: string): string => `${prefix} ${randomUUID().slice(0, 8)}`;

/** Abre el menú de usuario de la cabecera y elige una opción por su texto. */
export async function chooseUserMenu(page: Page, option: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: /^Menú de usuario/ }).click();
  await page.getByRole('menuitem', { name: option }).click();
}

/** Ejecuta `check` en modo claro y luego en modo oscuro (RNF-02). Debe poder repetirse sin efectos. */
export async function eachTheme(page: Page, check: () => Promise<void>): Promise<void> {
  // El tema se recuerda entre páginas: si un paso anterior ya lo dejó en oscuro, se parte de claro.
  if (await page.locator('html').evaluate((el) => el.classList.contains('dark'))) {
    await chooseUserMenu(page, 'Cambiar a modo claro');
    await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
  }
  await check();
  await chooseUserMenu(page, 'Cambiar a modo oscuro');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await check();
}

export interface Fixture {
  manufacturerId: string;
  categoryId: string;
  modelId: string;
  modelName: string;
  locationId: string;
  locationName: string;
}

/** Catálogo mínimo creado por API para que un test pueda crear activos por UI. */
export async function createCatalogFixture(request: APIRequestContext): Promise<Fixture> {
  const manufacturer = await apiPost<{ id: string; name: string }>(
    request,
    '/api/v1/manufacturers',
    {
      name: uniqueName('Fabricante'),
    },
  );
  const category = await apiPost<{ id: string }>(request, '/api/v1/categories', {
    name: uniqueName('Categoría'),
  });
  const modelName = uniqueName('Modelo');
  const model = await apiPost<{ id: string }>(request, '/api/v1/models', {
    name: modelName,
    manufacturerId: manufacturer.id,
    categoryId: category.id,
  });
  const locationName = uniqueName('Sala');
  const location = await apiPost<{ id: string }>(request, '/api/v1/locations', {
    name: locationName,
    type: 'warehouse',
  });
  return {
    manufacturerId: manufacturer.id,
    categoryId: category.id,
    modelId: model.id,
    modelName: `${manufacturer.name} ${modelName}`,
    locationId: location.id,
    locationName,
  };
}

export async function statusIdByName(request: APIRequestContext, name: string): Promise<string> {
  const res = await request.get(`/api/v1/status-labels?q=${encodeURIComponent(name)}&pageSize=100`);
  const data = ((await res.json()) as { data: { id: string; name: string }[] }).data;
  return data.find((s) => s.name === name)!.id;
}

export interface CreatedAsset {
  id: string;
  assetTag: string;
  name: string;
  serial: string;
}

/** Crea un activo por API (rápido) para los tests que ejercitan otra parte de la UI. */
export async function createAssetViaApi(
  request: APIRequestContext,
  fixture: Fixture,
  extra: Record<string, unknown> = {},
): Promise<CreatedAsset> {
  const name = uniqueName('Activo');
  const serial = `SN-${randomUUID().slice(0, 8)}`;
  const asset = await apiPost<{ id: string; assetTag: string }>(request, '/api/v1/assets', {
    name,
    serial,
    modelId: fixture.modelId,
    statusId: await statusIdByName(request, 'Disponible'),
    baseLocationId: fixture.locationId,
    ...extra,
  });
  return { id: asset.id, assetTag: asset.assetTag, name, serial };
}
