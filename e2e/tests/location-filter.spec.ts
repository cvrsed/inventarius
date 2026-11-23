import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN,
  apiPost,
  createAssetViaApi,
  createCatalogFixture,
  loginViaApi,
  uniqueName,
} from './support';

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

const place = (page: Page, body: Record<string, unknown>) =>
  apiPost<{ id: string }>(page.request, '/api/v1/locations', body);

/** Abre el filtro (barra en escritorio, panel en móvil), busca y elige; en móvil cierra el panel con «Ver N resultados». */
async function chooseLocation(
  page: Page,
  control: string,
  search: string,
  option: string | RegExp,
) {
  const mobile = (page.viewportSize()?.width ?? 0) < 768;
  if (mobile) await page.locator('#filters-panel-button').click();
  else if (control !== 'filter-locationId') await page.locator('#filters-more').click();
  await page.locator(`#${control}`).click();
  await page.getByPlaceholder('Buscar ubicación…').fill(search);
  await page.getByRole('option', { name: option }).click();
  if (mobile) await page.getByRole('button', { name: /^Ver \d+ resultado/ }).click();
  else await page.keyboard.press('Escape');
}

/**
 * Fix ubicación (U9): un activo instalado en un sitio de cliente de 4 niveles se encuentra filtrando por el sitio y por
 * un ancestro («incluye sububicaciones»); «Bodega base» solo ofrece bodegas.
 */
test('«Ubicación actual» encuentra un activo instalado en un sitio de 4 niveles, por el sitio y por un ancestro', async ({
  page,
}) => {
  const stamp = uniqueName('Zona').replace(/\s/g, '');
  const fixture = await createCatalogFixture(page.request);
  const country = await place(page, { name: `Chile ${stamp}`, type: 'other' });
  const client = await place(page, {
    name: `Cliente ${stamp}`,
    type: 'customer_site',
    parentId: country.id,
  });
  const building = await place(page, {
    name: `Edificio ${stamp}`,
    type: 'customer_site',
    parentId: client.id,
  });
  const room = await place(page, {
    name: `Sala ${stamp}`,
    type: 'customer_site',
    parentId: building.id,
  });
  const asset = await createAssetViaApi(page.request, fixture);
  const neighbour = await createAssetViaApi(page.request, fixture); // se queda en su bodega
  await apiPost(page.request, `/api/v1/assets/${asset.id}/checkout`, { locationId: room.id });

  for (const [search, option, chip] of [
    [`Sala ${stamp}`, new RegExp(`^Sala ${stamp}`), `Sala ${stamp}`],
    [`Chile ${stamp}`, new RegExp(`^Chile ${stamp}`), `Chile ${stamp} (incluye sububicaciones)`],
  ] as const) {
    await page.goto('/activos');
    await chooseLocation(page, 'filter-locationId', search, option);
    const chipEl = page.locator('[data-filter-chip]').filter({ hasText: 'Ubicación actual:' });
    await expect(chipEl).toContainText(chip);
    await expect(page.getByText(asset.name).locator('visible=true').first()).toBeVisible();
    await expect(page.getByText(neighbour.name)).toHaveCount(0);
    // La ruta completa va en el tooltip de la columna «Ubicación».
    await expect(
      page
        .locator(`[title="Chile ${stamp} > Cliente ${stamp} > Edificio ${stamp} > Sala ${stamp}"]`)
        .first(),
    ).toBeAttached();
  }
});

test('«Bodega base» está en Filtros y solo ofrece bodegas', async ({ page }) => {
  const stamp = uniqueName('Solo').replace(/\s/g, '');
  const warehouse = await place(page, { name: `Bodega ${stamp}`, type: 'warehouse' });
  await place(page, { name: `Sitio ${stamp}`, type: 'customer_site' });
  await place(page, { name: `Oficina ${stamp}`, type: 'office' });

  await page.goto('/activos');
  const mobile = (page.viewportSize()?.width ?? 0) < 768;
  if (mobile) await page.locator('#filters-panel-button').click();
  else {
    await expect(page.locator('#filter-baseLocationId')).toHaveCount(0); // no está en la barra
    await page.locator('#filters-more').click();
  }
  await page.locator('#filter-baseLocationId').click();
  await page.getByPlaceholder('Buscar ubicación…').fill(stamp);
  await expect(page.getByRole('option', { name: new RegExp(`^Bodega ${stamp}`) })).toBeVisible();
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.getByRole('option').click();
  await expect(page).toHaveURL(new RegExp(`baseLocationId=${warehouse.id}`));
});
