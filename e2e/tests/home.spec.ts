import { expect, test } from '@playwright/test';
import {
  ADMIN,
  expectNoA11yViolations,
  horizontalOverflow,
  loginViaApi,
  chooseUserMenu,
} from './support';

test.describe('página de inicio (con sesión)', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page.request, ADMIN.email, ADMIN.password);
  });

  test('muestra el layout y el estado real de la API', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await expect(page.getByText('Todo funciona con normalidad')).toBeVisible();
    await expect(page).toHaveTitle('Inventarius');
  });

  test('pasa axe (WCAG 2.2 AA) en modo claro y oscuro', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Todo funciona con normalidad')).toBeVisible();
    await expectNoA11yViolations(page);
    await chooseUserMenu(page, 'Cambiar a modo oscuro');
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    await expectNoA11yViolations(page);
  });

  test('el menú de usuario agrupa contraseña, tema y salir con texto y pasa axe abierto', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Menú de usuario/ }).click();
    const items = page.getByRole('menuitem');
    await expect(items).toHaveText([
      'Cambiar contraseña',
      'Cambiar a modo oscuro',
      'Cerrar sesión',
    ]);
    await expectNoA11yViolations(page);
    await items.first().click();
    await expect(page).toHaveURL(/cambiar-contrasena/);
  });

  test('en móvil la barra inferior tiene 5 destinos y «Más» abre el resto, con axe', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'solo en móvil');
    await page.goto('/');
    const bar = page.locator('.app-bottom-nav');
    await expect(bar.locator('li')).toHaveText([
      'Inicio',
      'Activos',
      'Consumibles',
      'Catálogo',
      'Más',
    ]);
    await bar.getByRole('button', { name: 'Más' }).click();
    const sheet = page.getByRole('dialog', { name: 'Más' });
    for (const name of ['Usuarios', 'Roles', 'Auditoría']) {
      await expect(sheet.getByRole('link', { name })).toBeVisible();
    }
    for (const name of ['Cambiar contraseña', 'Cambiar a modo oscuro', 'Cerrar sesión']) {
      await expect(sheet.getByRole('button', { name })).toBeVisible();
    }
    await expectNoA11yViolations(page);
    await sheet.getByRole('link', { name: 'Roles' }).click();
    await expect(page).toHaveURL(/\/roles$/);
    await expect(sheet).toBeHidden();
  });

  test('no hay scroll horizontal', async ({ page }) => {
    await page.goto('/');
    expect(await horizontalOverflow(page)).toBe(false);
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
    const link = page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Inicio' });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
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

test.describe('íconos y recursos (RNF-08)', () => {
  test('los íconos van en el build: ninguna petición sale del origen de la app', async ({
    page,
    baseURL,
  }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (!url.startsWith('data:') && !url.startsWith('blob:') && !url.startsWith(baseURL!))
        external.push(url);
    });
    await loginViaApi(page.request, ADMIN.email, ADMIN.password);
    for (const path of ['/', '/usuarios', '/roles', '/auditoria']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // Los íconos se dibujan como SVG en línea, no como imágenes remotas.
      await expect(page.locator('svg.iconify:visible').first()).toBeVisible();
    }
    await chooseUserMenu(page, 'Cambiar a modo oscuro');
    expect(external, `Peticiones a otros orígenes: ${external.join(', ')}`).toEqual([]);
  });
});

test.describe('API publicada tras el proxy', () => {
  test('health/ready responde 200 y el cuerpo esperado', async ({ request }) => {
    const res = await request.get('/api/health/ready');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok', checks: { database: 'up', queue: 'up' } });
  });

  test('las métricas no se exponen a través del proxy público', async ({ request }) => {
    expect((await request.get('/api/metrics')).status()).toBe(404);
  });

  test('las rutas protegidas exigen sesión', async ({ request }) => {
    expect((await request.get('/api/v1/users')).status()).toBe(401);
  });
});
