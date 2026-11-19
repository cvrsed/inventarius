import { expect, test } from '@playwright/test';
import { ADMIN, loginViaApi } from './support';

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

test.describe('usuarios: búsqueda en la URL [P44]', () => {
  test('la búsqueda vive en la URL y sobrevive a recargar', async ({ page }) => {
    await page.goto('/usuarios');
    const search = page.getByRole('searchbox', { name: /Buscar/ });
    await search.fill('admin');
    await expect(page).toHaveURL(/q=admin/);
    await page.reload();
    await expect(search).toHaveValue('admin');
    await expect(page.locator('[data-filter-chip]')).toHaveCount(0);
    await page.goto('/usuarios?q=zzz-no-existe');
    await expect(search).toHaveValue('zzz-no-existe');
    await expect(
      page.getByText('No hay resultados para esta búsqueda').locator('visible=true'),
    ).toBeVisible();
  });
});
