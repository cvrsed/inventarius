import { expect, test } from '@playwright/test';
import {
  ADMIN,
  apiPost,
  createAssetViaApi,
  createCatalogFixture,
  eachTheme,
  expectNoA11yViolations,
  horizontalOverflow,
  loginViaApi,
  provisionUser,
  statusIdByName,
} from './support';

test.describe('Inicio con resumen (RF-28)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page.request, ADMIN.email, ADMIN.password);
  });

  test('con activos no dice «Aún no hay activos» y enlaza al listado filtrado [P19]', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    await createAssetViaApi(page.request, fixture);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Disponibles/ })).toBeVisible();
    await expect(page.getByText('Aún no hay activos registrados')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Activos por estado' })).toBeVisible();
    // Cada estado con su nombre real; los tipos («desplegable», etc.) no se nombran en la UI.
    await expect(page.getByRole('link', { name: /^Disponible\s+\d+/ })).toBeVisible();
    await expect(page.getByText(/desplegable/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Activos por categoría' })).toBeVisible();
    // «Activos por estado» muestra los nombres reales, no los tipos internos [P20].
    const byStatus = page.locator('section[aria-labelledby="kind-title"]');
    await expect(byStatus.getByRole('link', { name: /^Disponible\b/ })).toBeVisible();
    await expect(page.getByText(/desplegable/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Stock disponible por bodega' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Últimos movimientos' })).toBeVisible();
    // «Estado del sistema» va al final, compacto, solo para administradores.
    await expect(page.getByText('Todo funciona con normalidad')).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(false);
    await eachTheme(page, () => expectNoA11yViolations(page));

    await page.getByRole('link', { name: /Disponibles/ }).click();
    await expect(page).toHaveURL(/statusKind=deployable/);
    await expect(page).toHaveURL(/assigned=no/);
    await expect(page.getByRole('heading', { level: 1, name: 'Activos' })).toBeVisible();
    await expect(page.locator('#filter-status-kind')).toContainText('Estados asignables');
  });

  test('un lote queda como «Pendientes de configuración» (por tipo de estado) [P19]', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const pending = await statusIdByName(page.request, 'Pendiente de configuración');
    await apiPost(page.request, '/api/v1/assets/batch', {
      modelId: fixture.modelId,
      quantity: 4,
      baseLocationId: fixture.locationId,
      statusId: pending,
    });
    await page.goto('/');
    const tile = page.getByRole('link', { name: /Pendientes de configuración/ });
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page).toHaveURL(/statusKind=pending/);
    await expect(page.getByText(/resultados?/)).toBeVisible();
  });

  test('el técnico ve «Mis equipos asignados» y no los totales [P19]', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    const tech = await provisionUser(
      page.request,
      () => playwright.request.newContext({ baseURL: baseURL! }),
      { role: 'Técnico de campo', prefix: 'tecnico-home' },
    );
    const me = (await (
      await page.request.get('/api/v1/assignees?q=Persona tecnico-home')
    ).json()) as {
      id: string;
      name: string;
    }[];
    const techId = me.find((m) => m.name.includes(tech.email.split('@')[0]!))!.id;
    await apiPost(page.request, `/api/v1/assets/${asset.id}/checkout`, { userId: techId });

    const other = await page.context().browser()!.newContext({ baseURL: baseURL! });
    const p = await other.newPage();
    await loginViaApi(p.request, tech.email, tech.password);
    await p.goto('/');
    await expect(p.getByRole('heading', { name: 'Mis equipos asignados' })).toBeVisible();
    await expect(p.getByText(asset.assetTag)).toBeVisible();
    await expect(p.getByRole('link', { name: /Disponibles/ })).toHaveCount(0);
    await expect(p.getByText('Estado del sistema')).toHaveCount(0);
    expect(await horizontalOverflow(p)).toBe(false);
    await expectNoA11yViolations(p);
    await other.close();
  });
});
