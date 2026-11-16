import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function expectNoA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

test.describe('página de inicio', () => {
  test('muestra el layout y el estado real de la API', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await expect(page.getByText('Todo funciona con normalidad')).toBeVisible();
    await expect(page).toHaveTitle('Inventarius');
  });

  test('pasa axe (WCAG 2.2 AA) en modo claro', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Todo funciona con normalidad')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('pasa axe (WCAG 2.2 AA) en modo oscuro', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click();
    await expect(page.locator('html')).toHaveClass(/app-dark/);
    await expect(page.getByText('Todo funciona con normalidad')).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('no hay scroll horizontal', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test('el enlace para saltar al contenido enfoca el main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#contenido')).toBeFocused();
  });

  test('la navegación se adapta: lateral en escritorio, inferior en móvil', async ({
    page,
  }, info) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(nav).toHaveCount(1);
    const box = await nav.getByRole('link', { name: 'Inicio' }).boundingBox();
    expect(box).not.toBeNull();
    if (info.project.name === 'mobile') {
      expect(box!.y).toBeGreaterThan(500);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    } else {
      expect(box!.x).toBeLessThan(300);
    }
  });

  test('una ruta inexistente muestra la página 404', async ({ page }) => {
    await page.goto('/no-existe');
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
    await expectNoA11yViolations(page);
  });
});

test.describe('API publicada tras el proxy', () => {
  test('health/ready responde 200 y el cuerpo esperado', async ({ request }) => {
    const res = await request.get('/api/health/ready');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', checks: { database: 'up', queue: 'up' } });
  });

  test('las métricas no se exponen a través del proxy público', async ({ request }) => {
    const res = await request.get('/api/metrics');
    expect(res.status()).toBe(404);
  });
});
