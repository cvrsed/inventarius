import { expect, test } from '@playwright/test';
import {
  ADMIN,
  STRONG_PASSWORD,
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
    await dialog.locator('.p-multiselect').click();
    await page.getByRole('option', { name: 'Lector' }).click();
    // Un clic fuera del panel lo cierra; el panel abierto de MultiSelect trae checkboxes internos sin etiqueta (Q21).
    await dialog.getByText('Nombre', { exact: true }).click();
    await expect(page.locator('.p-multiselect-overlay')).toBeHidden();
    await dialog.getByLabel('Contraseña inicial').fill(STRONG_PASSWORD);
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('Usuario creado')).toBeVisible();
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
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Restablecer contraseña' })
      .click();

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
    await dialog.getByLabel('Ver auditoría').check();
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Rol creado')).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
  });
});

test.describe('auditoría (RF-31)', () => {
  test('lista las acciones, se filtra por acción y pasa axe', async ({ page }) => {
    await page.goto('/auditoria');
    await expect(page.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
    await expect(page.getByText('Inicio de sesión').first()).toBeVisible();
    await expectNoA11yViolations(page);
    expect(await horizontalOverflow(page)).toBe(false);

    await page.getByLabel('Acción').click();
    await page.getByRole('option', { name: 'Inicio de sesión', exact: true }).click();
    await expect(page.getByText('Inicio de sesión').first()).toBeVisible();
    await expect(page.getByText('Usuario creado')).toHaveCount(0);
  });
});
