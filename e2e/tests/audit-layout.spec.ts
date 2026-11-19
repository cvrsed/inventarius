import { expect, test, type Page } from '@playwright/test';
import { ADMIN, createAssetViaApi, createCatalogFixture, loginViaApi } from './support';

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

/** El contenedor de la tabla no debe desbordar (no hay scroll horizontal dentro de la tabla ni en la página). */
const overflow = (page: Page) =>
  page.evaluate(() => {
    const table = document.querySelector('table');
    const wrapper = table?.parentElement;
    return {
      page: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      table: wrapper ? wrapper.scrollWidth > wrapper.clientWidth : null,
    };
  });

test('auditoría (P21): sin scroll horizontal en escritorio; la IP va al detalle', async ({
  page,
}, info) => {
  const fixture = await createCatalogFixture(page.request);
  // Un activo con rótulo largo y varios eventos, para que haya filas anchas.
  await createAssetViaApi(page.request, fixture, {
    name: 'Medidor de caudal ultrasónico con registro remoto LoRaWAN en terreno',
  });
  const mobile = info.project.name === 'mobile';
  const widths = mobile ? [360] : [1280, 1024, 800, 768];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/auditoria');
    await expect(page.getByRole('heading', { name: 'Auditoría' })).toBeVisible();
    await expect(
      mobile ? page.locator('ul[aria-busy] > li').first() : page.locator('tbody tr').first(),
    ).toBeVisible();
    // Se reintenta: con otras pruebas corriendo en paralelo la tabla puede tardar en asentarse; un desborde real persiste.
    await expect
      .poll(async () => (await overflow(page)).page, { message: `la página desborda a ${width}px` })
      .toBe(false);
    if (!mobile) {
      await expect
        .poll(async () => (await overflow(page)).table, {
          message: `la tabla desborda a ${width}px`,
        })
        .toBe(false);
      await expect(page.getByRole('columnheader', { name: 'IP' })).toHaveCount(0);
    }
  }
  if (!mobile) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/auditoria');
    await page
      .getByRole('button', { name: /^Detalle/ })
      .first()
      .click();
    await expect(page.getByText('IP', { exact: true }).first()).toBeVisible();
  }
});
