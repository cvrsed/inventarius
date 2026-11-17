import { expect, test } from '@playwright/test';
import {
  ADMIN,
  expectNoA11yViolations,
  horizontalOverflow,
  loginViaApi,
  loginViaUi,
  provisionUser,
  chooseUserMenu,
} from './support';

test.describe('login y sesión (RF-01)', () => {
  test('un anónimo es llevado al login y vuelve a la ruta pedida tras entrar', async ({ page }) => {
    await page.goto('/auditoria');
    await expect(page).toHaveURL(/iniciar-sesion\?redirect=(%2F|\/)auditoria/);
    await page.getByLabel('Correo electrónico').fill(ADMIN.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
  });

  test('la pantalla de login pasa axe y no desborda en móvil', async ({ page }) => {
    await page.goto('/iniciar-sesion');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expectNoA11yViolations(page);
    expect(await horizontalOverflow(page)).toBe(false);
  });

  test('una contraseña incorrecta muestra un error accionable', async ({ page }) => {
    await loginViaUi(page, ADMIN.email, 'contraseña-equivocada-123');
    await expect(page.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
    await expect(page).toHaveURL(/iniciar-sesion/);
  });

  test('cerrar sesión devuelve al login y la ruta queda protegida', async ({ page }) => {
    await loginViaApi(page.request, ADMIN.email, ADMIN.password);
    await page.goto('/');
    await chooseUserMenu(page, 'Cerrar sesión');
    await expect(page).toHaveURL(/iniciar-sesion/);
    await page.goto('/usuarios');
    await expect(page).toHaveURL(/iniciar-sesion/);
  });

  test('tras la inactividad la sesión expira y se pide iniciar sesión de nuevo', async ({
    page,
  }) => {
    await loginViaApi(page.request, ADMIN.email, ADMIN.password);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await page.waitForTimeout(17_000); // el entorno e2e usa 15 s de inactividad
    await page.goto('/usuarios');
    await expect(page).toHaveURL(/iniciar-sesion/);
  });
});

test.describe('bloqueo por intentos fallidos (RF-05)', () => {
  test('tras 5 fallos la cuenta se bloquea y la UI lo informa', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const adminCtx = page.request;
    await loginViaApi(adminCtx, ADMIN.email, ADMIN.password);
    const user = await provisionUser(
      adminCtx,
      () => playwright.request.newContext({ baseURL: baseURL! }),
      { role: 'Lector', prefix: 'lock' },
    );

    const fresh = await page.context().browser()!.newContext({ baseURL: baseURL! });
    const p = await fresh.newPage();
    for (let i = 0; i < 5; i++) {
      await loginViaUi(p, user.email, 'contraseña-equivocada-123');
      await expect(p.getByRole('alert')).toContainText('Correo o contraseña incorrectos');
    }
    await loginViaUi(p, user.email, user.password); // correcta, pero ya bloqueada
    await expect(p.getByRole('alert')).toContainText('Demasiados intentos fallidos');
    await expect(p).toHaveURL(/iniciar-sesion/);
    await fresh.close();
  });
});
