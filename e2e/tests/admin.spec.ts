import { expect, test } from '@playwright/test';
import {
  ADMIN,
  STRONG_PASSWORD,
  createCatalogFixture,
  eachTheme,
  expectNoA11yViolations,
  horizontalOverflow,
  loginViaApi,
  loginViaUi,
  provisionUser,
  uniqueEmail,
} from './support';

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

test.describe('gestión de usuarios (RF-03, RF-04)', () => {
  test('el administrador crea un usuario desde la UI y aparece en el listado', async ({ page }) => {
    const email = uniqueEmail('nuevo');
    await page.goto('/usuarios');
    await expect(page.getByRole('heading', { level: 1, name: 'Usuarios' })).toBeVisible();
    await expectNoA11yViolations(page);
    expect(await horizontalOverflow(page)).toBe(false);

    await page.getByRole('button', { name: 'Nuevo usuario' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo usuario' });
    await dialog.getByLabel('Nombre').fill('Persona Nueva');
    await dialog.getByLabel('Correo').fill(email);
    await dialog.getByRole('button', { name: 'Roles' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    // axe con el panel de roles ABIERTO (RNF-02).
    await expectNoA11yViolations(page);
    await page.getByRole('option', { name: 'Lector' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Contraseña inicial').fill(STRONG_PASSWORD);
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Alta de usuario', { exact: true })).toBeVisible();
    await page.getByRole('searchbox').fill(email);
    await expect(page.getByText(email)).toBeVisible();
  });

  test('restablecer contraseña: la persona entra con la temporal y debe cambiarla', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const user = await provisionUser(
      page.request,
      () => playwright.request.newContext({ baseURL: baseURL! }),
      { role: 'Operador', prefix: 'reset' },
    );
    await page.goto('/usuarios');
    await page.getByRole('searchbox').fill(user.email);
    await expect(page.getByText(user.email)).toBeVisible();
    await page
      .getByRole('button', {
        name: new RegExp(`^Restablecer contraseña .*${user.email.split('@')[0]}`),
      })
      .click();
    const confirm = page.getByRole('dialog', { name: 'Restablecer contraseña' });
    await expect(confirm).toBeVisible();
    await expectNoA11yViolations(page); // diálogo de confirmación ABIERTO
    await confirm.getByRole('button', { name: 'Restablecer contraseña' }).click();

    const temp = await page
      .getByRole('dialog', { name: 'Contraseña temporal' })
      .getByRole('textbox')
      .inputValue();
    expect(temp.length).toBeGreaterThanOrEqual(16);

    const other = await page.context().browser()!.newContext({ baseURL: baseURL! });
    const p = await other.newPage();
    await loginViaUi(p, user.email, temp);
    await expect(p.getByRole('heading', { name: 'Cambia tu contraseña' })).toBeVisible();
    await p.goto('/usuarios'); // no puede ir a otra parte mientras sea temporal
    await expect(p.getByRole('heading', { name: 'Cambia tu contraseña' })).toBeVisible();
    await expectNoA11yViolations(p);

    await p.getByLabel('Contraseña actual', { exact: true }).fill(temp);
    await p.getByLabel('Contraseña nueva', { exact: true }).fill('otra-clave-definitiva-2026');
    await p.getByLabel('Repite la contraseña nueva').fill('otra-clave-definitiva-2026');
    await p.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(p.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await other.close();
  });
});

test.describe('permisos por rol', () => {
  test('un Lector no ve la administración y el servidor rechaza sus peticiones', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const user = await provisionUser(
      page.request,
      () => playwright.request.newContext({ baseURL: baseURL! }),
      { role: 'Lector', prefix: 'lector' },
    );
    const other = await page.context().browser()!.newContext({ baseURL: baseURL! });
    const p = await other.newPage();
    await loginViaUi(p, user.email, user.password);
    await expect(p.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();

    const nav = p.getByRole('navigation', { name: 'Navegación principal' }).locator('visible=true');
    await expect(nav.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Auditoría' })).toHaveCount(0);

    await p.goto('/usuarios');
    await expect(
      p.getByRole('heading', { name: 'No tienes permiso para ver esta página' }),
    ).toBeVisible();
    await expectNoA11yViolations(p);
    expect((await other.request.get('/api/v1/users')).status()).toBe(403);
    await other.close();
  });
});

test.describe('roles (RF: matriz de permisos)', () => {
  test('crear un rol desde la UI y verlo en la lista; pasa axe y no desborda', async ({ page }) => {
    const name = `Auditor ${Date.now()}`;
    await page.goto('/roles');
    await expect(page.getByRole('heading', { level: 1, name: 'Roles y permisos' })).toBeVisible();
    await expectNoA11yViolations(page);
    expect(await horizontalOverflow(page)).toBe(false);

    await page.getByRole('button', { name: 'Nuevo rol' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo rol' });
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByRole('checkbox', { name: 'Ver auditoría' }).check();
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Alta de rol', { exact: true })).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });
});

test.describe('auditoría (RF-31)', () => {
  test('lista las acciones, se filtra por acción y pasa axe', async ({ page }) => {
    await page.goto('/auditoria');
    await expect(page.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
    await expect(page.getByText('Inicio de sesión').locator('visible=true').first()).toBeVisible();
    await expectNoA11yViolations(page);
    expect(await horizontalOverflow(page)).toBe(false);

    await page.getByRole('combobox', { name: 'Acción' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectNoA11yViolations(page); // select de página ABIERTO
    await page.getByRole('option', { name: 'Inicio de sesión', exact: true }).click();
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    await expect(page.getByText('Inicio de sesión').locator('visible=true').first()).toBeVisible();
    await expect(page.getByText('Alta de usuario').locator('visible=true')).toHaveCount(0);
  });

  test('el detalle es una lista campo → valor en español, no JSON [P25]', async ({ page }) => {
    const fixture = await createCatalogFixture(page.request);
    await page.goto('/auditoria');
    await page.getByRole('combobox', { name: 'Acción' }).click();
    await page.getByRole('option', { name: 'Alta de categoría', exact: true }).click();
    await page
      .getByRole('button', { name: /^Detalle/ })
      .locator('visible=true')
      .first()
      .click();
    const detail = page.locator('dl').locator('visible=true').first();
    await expect(detail).toContainText('Nombre');
    await expect(detail).toContainText('Activo');
    await expect(detail).toContainText('Sí');
    await expect(page.locator('pre')).toHaveCount(0);
    expect(fixture.categoryId).toBeTruthy();
    expect(await horizontalOverflow(page)).toBe(false);
    await eachTheme(page, () => expectNoA11yViolations(page));
  });
});
