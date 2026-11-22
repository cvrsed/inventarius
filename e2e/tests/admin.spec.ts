import { expect, test } from '@playwright/test';
import {
  ADMIN,
  STRONG_PASSWORD,
  apiDelete,
  chooseFilter,
  filterControl,
  apiPost,
  createAssetViaApi,
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

    await expect(page.getByText('Usuario creado', { exact: true })).toBeVisible();
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
    // D5: los permisos de consumibles salen con su texto, no como claves crudas.
    for (const label of [
      'Ver consumibles',
      'Gestionar catálogo de consumibles',
      'Ingresar a bodega',
      'Entregar y registrar devoluciones',
      'Trasladar entre bodegas',
      'Ajustar stock',
      'Anular movimientos',
    ]) {
      await expect(dialog.getByRole('checkbox', { name: label })).toBeVisible();
    }
    await expect(dialog.getByText(/consumables:/)).toHaveCount(0);
    await expect(dialog.getByText(/permissions\./)).toHaveCount(0);
    await dialog.getByRole('checkbox', { name: 'Ver auditoría' }).check();
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Rol creado', { exact: true })).toBeVisible();
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

    // Escritorio: menú «Acción ▾» de la barra; móvil: campo del panel «Filtros (n)» [P41].
    const mobile = (page.viewportSize()?.width ?? 0) < 768;
    if (mobile) await page.locator('#filters-panel-button').click();
    await filterControl(page, 'Acción').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectNoA11yViolations(page); // menú de filtro ABIERTO
    await page.getByRole('option', { name: 'Inicio de sesión', exact: true }).click();
    if (mobile) await page.getByRole('button', { name: /^Ver \d+ resultado/ }).click();
    await expect(page.locator('[data-filter-chip]').filter({ hasText: 'Acción:' })).toBeVisible();
    await expect(page.locator('#app')).not.toHaveAttribute('inert', '');
    await expect(page.getByText('Inicio de sesión').locator('visible=true').first()).toBeVisible();
    await expect(page.getByText('Alta de usuario').locator('visible=true')).toHaveCount(0);
  });

  test('«Registro» identifica el activo y solo enlaza mientras siga vigente [P40]', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    const label = `${asset.assetTag} ${asset.name}`;
    await page.goto('/auditoria');
    const link = page.getByRole('link', { name: label }).locator('visible=true').first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', `/activos/${asset.id}`);

    await apiDelete(page.request, `/api/v1/assets/${asset.id}`, { reason: 'Equipo robado' });
    await page.reload();
    // El rótulo se conserva (en el alta y en la baja) pero ya no hay enlace a la ficha.
    await expect(page.getByText(label).locator('visible=true').first()).toBeVisible();
    await expect(page.getByRole('link', { name: label })).toHaveCount(0);

    // El detalle de la baja: situación antes/después, motivo y estado.
    await chooseFilter(page, 'Acción', 'Baja');
    await page
      .locator('tr:visible, li:visible')
      .filter({ hasText: label })
      .getByRole('button', { name: /^Detalle/ })
      .click();
    const detail = page.locator('dl').locator('visible=true').first();
    await expect(detail).toContainText('Situación');
    await expect(detail).toContainText('Vigente');
    await expect(detail).toContainText('Dado de baja');
    await expect(detail).toContainText('Motivo');
    // [P43] «Antes → Después» solo para lo que cambió de valor; el motivo es un dato del evento: valor simple.
    await expect(detail.locator('dt', { hasText: 'Situación' }).locator('+ dd')).toContainText(
      'Antes',
    );
    await expect(detail.locator('dt', { hasText: 'Motivo' }).locator('+ dd')).not.toContainText(
      'Antes',
    );
    await expect(detail.locator('dt', { hasText: 'Motivo' }).locator('+ dd')).toHaveText(
      'Equipo robado',
    );
    await expect(detail).toContainText('Equipo robado');
    expect(await horizontalOverflow(page)).toBe(false);
    await eachTheme(page, () => expectNoA11yViolations(page));
  });

  test('el detalle traduce también los valores: «Tipo de destino» dice Usuario, no user [P29]', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    const me = (await (await page.request.get('/api/v1/auth/me')).json()) as { id: string };
    await apiPost(page.request, `/api/v1/assets/${asset.id}/checkout`, { userId: me.id });
    await page.goto('/auditoria');
    await chooseFilter(page, 'Acción', 'Asignación');
    await page
      .getByRole('button', { name: /^Detalle/ })
      .locator('visible=true')
      .first()
      .click();
    const detail = page.locator('dl').locator('visible=true').first();
    await expect(detail).toContainText('Tipo de destino');
    await expect(detail).toContainText('Usuario');
    await expect(detail).not.toContainText(/\buser\b/);
  });

  test('el detalle es una lista campo → valor en español, no JSON [P25]', async ({ page }) => {
    const fixture = await createCatalogFixture(page.request);
    await page.goto('/auditoria');
    await chooseFilter(page, 'Acción', 'Alta de categoría');
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
