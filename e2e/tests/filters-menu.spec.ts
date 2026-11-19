import { expect, test, type Locator } from '@playwright/test';
import {
  ADMIN,
  apiPost,
  createAssetViaApi,
  createCatalogFixture,
  eachTheme,
  expectNoA11yViolations,
  loginViaApi,
  uniqueName,
} from './support';

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

/** Ningún texto recortado con «…»: nada con `text-overflow: ellipsis` y nada que desborde su caja. */
async function expectNothingTruncated(scope: Locator) {
  const bad = await scope.evaluate((root) =>
    [...root.querySelectorAll('*')]
      .filter((el) => {
        const cs = getComputedStyle(el);
        const clipped = el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible';
        return cs.textOverflow === 'ellipsis' || (cs.whiteSpace === 'nowrap' && clipped);
      })
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 80)),
  );
  expect(bad).toEqual([]);
}

/**
 * [P42] Menús de filtro: el panel no hereda el ancho del botón (280–400 px), cabe en la pantalla, los textos largos
 * pasan a 2 líneas y las ubicaciones muestran el nombre arriba y la ruta de sus padres abajo. La búsqueda encuentra por
 * nombre y por ruta. Se prueba con nombres largos en escritorio y en 360 px.
 */
test('el menú de ubicación: dos líneas, ancho acotado, sin recortes y búsqueda por ruta [P42]', async ({
  page,
}, info) => {
  const stamp = uniqueName('Ruta').replace(/\s/g, '');
  const root = await apiPost<{ id: string }>(page.request, '/api/v1/locations', {
    name: `Empresa Ejemplo con un nombre larguísimo ${stamp}`,
    type: 'customer_site',
  });
  const mid = await apiPost<{ id: string }>(page.request, '/api/v1/locations', {
    name: 'Región Metropolitana de Santiago de Chile',
    type: 'customer_site',
    parentId: root.id,
  });
  const leafName = `Bodega Central de Distribución Norte número uno ${stamp}`;
  const leaf = await apiPost<{ id: string }>(page.request, '/api/v1/locations', {
    name: leafName,
    type: 'warehouse',
    parentId: mid.id,
  });
  const fixture = await createCatalogFixture(page.request);
  await createAssetViaApi(page.request, fixture, { baseLocationId: leaf.id });

  await page.goto('/activos');
  const mobile = info.project.name === 'mobile';
  if (mobile) await page.locator('#filters-panel-button').click();
  else expect(await page.locator('#filter-baseLocationId').boundingBox()).toBeTruthy();

  await page.locator('#filter-baseLocationId').click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();

  // Placeholder del buscador interno completo.
  const search = page.getByPlaceholder('Buscar ubicación…');
  await expect(search).toBeVisible();
  const fits = await search.evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);

  // La búsqueda encuentra por ruta (el padre), no solo por el nombre del lugar.
  await search.fill(stamp);
  const option = page.getByRole('option').filter({ hasText: leafName });
  await expect(option).toHaveCount(1);
  await search.fill('Región Metropolitana de Santiago');
  await expect(page.getByRole('option').filter({ hasText: leafName })).toHaveCount(1);
  await search.fill(stamp);

  // Dos líneas: nombre arriba, ruta de los padres abajo (separada con ›).
  await expect(option).toContainText(leafName);
  await expect(option).toContainText(
    `Empresa Ejemplo con un nombre larguísimo ${stamp} › Región Metropolitana de Santiago de Chile`,
  );
  const lines = await option.evaluate((el) => {
    const label = el.querySelector('[data-slot="itemLabel"]')!.getBoundingClientRect();
    const desc = el.querySelector('[data-slot="itemDescription"]')!.getBoundingClientRect();
    return { descBelow: desc.top >= label.bottom - 1 };
  });
  expect(lines.descBelow).toBe(true);

  // Ancho del panel entre 280 y 400 px (en 360 px, acotado por la pantalla) y dentro de la pantalla.
  const panel = page.locator('[data-slot="content"]').filter({ has: listbox });
  const box = (await panel.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(mobile ? 280 : 279.5);
  expect(box.width).toBeLessThanOrEqual(400.5);
  expect(box.x).toBeGreaterThanOrEqual(-0.5);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
  await expectNothingTruncated(panel);
  await expectNoA11yViolations(page); // menú ABIERTO

  await option.click();
  await expect(page).toHaveURL(new RegExp(`baseLocationId=${leaf.id}`));
  if (mobile) await page.getByRole('button', { name: /^Ver \d+ resultado/ }).click();
  else await page.keyboard.press('Escape');

  // El chip muestra solo el nombre del lugar, entero (envuelve, no recorta).
  const chip = page.locator('[data-filter-chip]').filter({ hasText: 'Ubicación base:' });
  await expect(chip).toContainText(leafName);
  await expect(chip).not.toContainText('Empresa Ejemplo');
  await expectNothingTruncated(chip);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await eachTheme(page, () => expectNoA11yViolations(page));
});

test('los otros menús (estado, categoría) tampoco recortan y su buscador dice qué busca [P42]', async ({
  page,
}, info) => {
  const mobile = info.project.name === 'mobile';
  await page.goto('/activos');
  if (mobile) await page.locator('#filters-panel-button').click();
  for (const [id, placeholder] of [
    ['statusId', 'Buscar estado…'],
    ['categoryId', 'Buscar categoría…'],
  ] as const) {
    await page.locator(`#filter-${id}`).click();
    await expect(page.getByPlaceholder(placeholder)).toBeVisible();
    const panel = page.locator('[data-slot="content"]').filter({ has: page.getByRole('listbox') });
    const box = (await panel.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(400.5);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    await expectNothingTruncated(panel);
    await expectNoA11yViolations(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
  }
});
