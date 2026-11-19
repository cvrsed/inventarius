import { expect, test, type Page } from '@playwright/test';
import { ADMIN, createAssetViaApi, createCatalogFixture, loginViaApi } from './support';

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

/** Campos que Chrome reporta («A form field element should have an id or name attribute»): ni `id` ni `name`. */
async function fieldsWithoutIdOrName(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('input, select, textarea')]
      .filter((el) => !el.getAttribute('id') && !el.getAttribute('name'))
      .map((el) => {
        const e = el as HTMLInputElement;
        const label = e.getAttribute('aria-label') ?? e.getAttribute('placeholder') ?? '';
        return `${e.tagName.toLowerCase()}[type=${e.type}] «${label}» en ${e.closest('form')?.id || e.closest('[role=dialog]') ? 'diálogo/form' : 'página'}`;
      }),
  );
}

/** [P31] Todos los campos de formulario llevan `id` o `name` (autocompletado y accesibilidad). */
test('ninguna pantalla tiene campos sin id ni name [P31]', async ({ page }) => {
  const fixture = await createCatalogFixture(page.request);
  const asset = await createAssetViaApi(page.request, fixture);
  const found: Record<string, string[]> = {};
  const check = async (name: string) => {
    const missing = await fieldsWithoutIdOrName(page);
    if (missing.length) found[name] = missing;
  };

  for (const path of [
    '/',
    '/activos',
    `/activos/${asset.id}`,
    `/activos/${asset.id}/editar`,
    '/activos/nuevo',
    '/activos/lote',
    '/catalogo/categories',
    '/catalogo/models',
    '/catalogo/locations',
    '/catalogo/statuses',
    '/usuarios',
    '/roles',
    '/auditoria',
    '/cambiar-contrasena',
  ]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await check(path);
  }

  // Diálogos: nuevo registro de catálogo, nuevo usuario, nuevo rol y acciones del activo.
  await page.goto('/catalogo/models');
  await page.getByRole('button', { name: /^Nuevo/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('diálogo de catálogo');
  await page.keyboard.press('Escape');
  await page.goto('/usuarios');
  await page.getByRole('button', { name: 'Nuevo usuario' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('diálogo de usuario');
  await page.keyboard.press('Escape');
  await page.goto('/roles');
  await page.getByRole('button', { name: 'Nuevo rol' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await check('diálogo de rol');
  await page.keyboard.press('Escape');
  await page.goto(`/activos/${asset.id}`);
  for (const action of ['Asignar', 'Cambiar estado', 'Dar de baja']) {
    await page.getByRole('button', { name: action }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check(`diálogo ${action}`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  }

  // Selectores abiertos (el buscador del listbox es un input).
  await page.goto('/activos/nuevo');
  await page
    .locator('form')
    .getByRole('button', { name: /^Modelo/ })
    .click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await check('selector con búsqueda abierto');

  // Barra de filtros [P41]: menú de la barra (escritorio) o panel inferior (móvil), y «+ Filtros».
  for (const path of ['/auditoria', '/activos']) {
    await page.goto(path);
    const mobile = (page.viewportSize()?.width ?? 0) < 768;
    if (mobile) {
      await page.locator('#filters-panel-button').click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await check(`panel de filtros ${path}`);
      await page.keyboard.press('Escape');
    } else {
      await page.locator(path === '/auditoria' ? '#filter-action' : '#filter-categoryId').click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await check(`menú de filtro ${path}`);
      await page.keyboard.press('Escape');
      if (path === '/activos') {
        await page.locator('#filters-more').click();
        await check('«+ Filtros»');
        await page.keyboard.press('Escape');
      }
    }
  }

  expect(found).toEqual({});
});
