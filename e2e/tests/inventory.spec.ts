import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN,
  apiPatchAsset,
  createAssetViaApi,
  createCatalogFixture,
  eachTheme,
  expectNoA11yViolations,
  horizontalOverflow,
  loginViaApi,
  provisionUser,
  uniqueName,
  type Fixture,
  chooseUserMenu,
} from './support';

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

/** Abre un selector con búsqueda, escribe y elige una opción. */
async function pick(page: Page, scope: ReturnType<Page['locator']>, label: RegExp, option: string) {
  await scope.getByRole('button', { name: label }).click();
  await page.getByPlaceholder(/Buscar…/).fill(option.slice(0, 12));
  await page.getByRole('option', { name: option }).click();
  // Hasta que el panel anterior se cierre sigue en el DOM con su propio buscador: se espera antes de seguir.
  await expect(page.getByRole('listbox')).toBeHidden();
}

/** La tabla (escritorio) y las tarjetas (móvil) existen a la vez; solo una se ve. */
const visibleText = (page: Page, text: string) => page.getByText(text).locator('visible=true');

/** Los avisos viven en su región; el lector de pantalla también recibe una copia oculta, que aquí no cuenta. */
const toast = (page: Page, text: string | RegExp) =>
  page
    .getByLabel(/^Notificaciones/)
    .getByText(text)
    .first();

test.describe('catálogo (RF-10 a RF-14)', () => {
  const SECTION_LABELS: [string, string][] = [
    ['categories', 'Categorías'],
    ['manufacturers', 'Fabricantes'],
    ['models', 'Modelos'],
    ['locations', 'Ubicaciones'],
    ['statuses', 'Estados'],
  ];

  test('al entrar directo a cada ruta, la pestaña (o el select en móvil) muestra la sección', async ({
    page,
  }) => {
    const wide = (page.viewportSize()?.width ?? 0) >= 768;
    const active = wide
      ? page
          .getByRole('navigation', { name: 'Secciones del catálogo' })
          .locator('a[aria-current="page"]')
      : page.getByRole('combobox', { name: 'Sección del catálogo' });
    for (const [slug, label] of SECTION_LABELS) {
      await page.goto(`/catalogo/${slug}`);
      if (wide) await expect(active).toHaveText(label);
      else await expect(active).toContainText(label);
    }
    await page.goto('/catalogo');
    await expect(page).toHaveURL(/\/catalogo\/categories$/);
    if (wide) await expect(active).toHaveText('Categorías');
    else await expect(active).toContainText('Categorías');
  });

  test('en móvil el select de sección cambia de sección y pasa axe abierto', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'en escritorio hay pestañas');
    await page.goto('/catalogo/categories');
    await expect(page.getByRole('navigation', { name: 'Secciones del catálogo' })).toBeHidden();
    await page.getByRole('combobox', { name: 'Sección del catálogo' }).click();
    await expectNoA11yViolations(page);
    await page.getByRole('option', { name: 'Modelos' }).click();
    await expect(page).toHaveURL(/\/catalogo\/models$/);
  });

  test('CRUD de fabricantes: crear, editar, desactivar y borrar, con axe en claro y oscuro', async ({
    page,
  }) => {
    const name = uniqueName('Acme');
    await page.goto('/catalogo/manufacturers');
    await expect(page.getByRole('heading', { level: 1, name: 'Catálogo' })).toBeVisible();
    await eachTheme(page, () => expectNoA11yViolations(page));
    expect(await horizontalOverflow(page)).toBe(false);

    await page.getByRole('button', { name: 'Nuevo fabricante' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo fabricante' });
    await expectNoA11yViolations(page); // diálogo abierto
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Registro creado')).toBeVisible();

    await page.getByRole('searchbox').fill(name);
    await expect(page.getByRole('button', { name: `Editar ${name}` })).toBeVisible();

    await page.getByRole('button', { name: `Editar ${name}` }).click();
    const edit = page.getByRole('dialog', { name: 'Editar fabricante' });
    await edit.getByLabel('Nombre').fill(`${name} SpA`);
    await edit.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Cambios guardados')).toBeVisible();
    await expect(page.getByRole('button', { name: `Editar ${name} SpA` })).toBeVisible();

    await page.getByRole('button', { name: `Desactivar ${name} SpA` }).click();
    await expect(toast(page, 'Estado actualizado')).toBeVisible();
    await expect(page.getByRole('button', { name: `Activar ${name} SpA` })).toBeVisible();

    await page.getByRole('button', { name: `Eliminar ${name} SpA` }).click();
    const confirm = page.getByRole('dialog', { name: 'Eliminar fabricante' });
    await expect(confirm).toBeVisible();
    await expectNoA11yViolations(page); // confirmación abierta
    await confirm.getByRole('button', { name: 'Eliminar' }).click();
    await expect(toast(page, 'Registro eliminado')).toBeVisible();
    await expect(page.getByText('No hay resultados para esta búsqueda')).toBeVisible();
  });

  test('un fabricante en uso no se borra: Eliminar queda deshabilitado con el motivo (RF-14)', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const mk = await (
      await page.request.get(`/api/v1/manufacturers/${fixture.manufacturerId}`)
    ).json();
    await page.goto('/catalogo/manufacturers');
    await page.getByRole('searchbox').fill(mk.name);
    const remove = page.getByRole('button', { name: `Eliminar ${mk.name}` });
    await expect(remove).toBeDisabled();
    if ((page.viewportSize()?.width ?? 0) >= 768) {
      await expect(remove).toHaveAccessibleDescription(/está en uso/);
    } else {
      await expect(
        page
          .getByRole('listitem')
          .filter({ hasText: mk.name })
          .getByText(/está en uso/),
      ).toBeVisible();
    }
    await expect(page.getByRole('button', { name: `Editar ${mk.name}` })).toBeVisible();
    // La API sigue siendo la barrera: borrar directamente responde 409 e invita a desactivar.
    const token = (
      (await (await page.request.get('/api/v1/auth/csrf')).json()) as { token: string }
    ).token;
    const res = await page.request.delete(`/api/v1/manufacturers/${fixture.manufacturerId}`, {
      headers: { 'x-csrf-token': token },
    });
    expect(res.status()).toBe(409);
  });

  test('modelo: los campos LoRaWAN aparecen solo con una categoría LoRaWAN; selector abierto pasa axe', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const lora = uniqueName('Medidores LoRa');
    await (
      await page.request.post('/api/v1/categories', {
        data: { name: lora, extension: 'lorawan' },
        headers: {
          'x-csrf-token': (await (await page.request.get('/api/v1/auth/csrf')).json()).token,
        },
      })
    ).json();
    await page.goto('/catalogo/models');
    await page.getByRole('button', { name: 'Nuevo modelo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo modelo' });
    await expect(dialog.getByRole('combobox', { name: /^Clase/ })).toHaveCount(0);

    await dialog.getByRole('button', { name: /^Categoría/ }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectNoA11yViolations(page); // selector con búsqueda ABIERTO
    await page.getByPlaceholder(/Buscar…/).fill(lora);
    await page.getByRole('option', { name: lora }).click();
    const classSelect = dialog.getByRole('combobox', { name: /^Clase/ });
    await expect(classSelect).toContainText('Seleccione clase');
    // Región, versión y parámetros regionales: listas cerradas con búsqueda, en español.
    await dialog.getByRole('button', { name: /^Región \/ plan de frecuencias/ }).click();
    await expect(page.getByRole('option', { name: /^AU915/ })).toBeVisible();
    await expect(page.getByRole('option')).toHaveCount(13);
    await expectNoA11yViolations(page); // lista de regiones ABIERTA
    await page.getByPlaceholder(/Buscar…/).fill('AS923');
    await expect(page.getByRole('option')).toHaveCount(4);
    await page.getByRole('option', { name: /^AS923-1/ }).click();
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(dialog.getByRole('button', { name: /^Versión de LoRaWAN/ })).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: /^Versión de parámetros regionales/ }),
    ).toBeVisible();
    // La clase es obligatoria.
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog.getByText('Este campo es obligatorio').first()).toBeVisible();
    expect(fixture.modelId).toBeTruthy();
  });

  test('ubicaciones jerárquicas: la lista muestra la ruta completa', async ({ page }) => {
    const parent = uniqueName('Cliente');
    await page.goto('/catalogo/locations');
    await page.getByRole('button', { name: 'Nueva ubicación' }).click();
    const first = page.getByRole('dialog', { name: 'Nueva ubicación' });
    await first.getByLabel('Nombre').fill(parent);
    await first.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Registro creado')).toBeVisible();

    await page.getByRole('button', { name: 'Nueva ubicación' }).click();
    const child = page.getByRole('dialog', { name: 'Nueva ubicación' });
    await child.getByLabel('Nombre').fill('Edificio 1');
    await pick(page, child, /^Ubicación superior/, parent);
    await child.getByRole('button', { name: 'Guardar' }).click();
    await page.getByRole('searchbox').fill(parent);
    await expect(page.getByText(`${parent} > Edificio 1`).first()).toBeVisible();
  });
});

async function createAssetViaUi(page: Page, fixture: Fixture, name: string, serial: string) {
  await page.goto('/activos/nuevo');
  await expect(page.getByRole('heading', { level: 1, name: 'Nuevo activo' })).toBeVisible();
  await page.getByLabel('Nombre', { exact: false }).first().fill(name);
  await pick(page, page.locator('form'), /^Modelo/, fixture.modelName);
  await pick(page, page.locator('form'), /^Estado/, 'Disponible');
  await pick(page, page.locator('form'), /^Ubicación base/, fixture.locationName);
  await page.getByLabel('Número de serie').fill(serial);
  await page.getByLabel('Costo de compra').fill('1234,5');
  await page.getByLabel('Garantía (meses)').fill('12');
  await page.getByRole('button', { name: 'Guardar' }).click();
}

test.describe('activos: CRUD completo (RF-20 a RF-25)', () => {
  test('alta por la UI con etiqueta autogenerada; la ficha muestra lo clave y pasa axe', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    await page.goto('/activos/nuevo');
    await eachTheme(page, () => expectNoA11yViolations(page));
    expect(await horizontalOverflow(page)).toBe(false);

    await page
      .locator('form')
      .getByRole('button', { name: /^Modelo/ })
      .click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectNoA11yViolations(page); // selector con búsqueda ABIERTO
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();

    const name = uniqueName('Notebook');
    await createAssetViaUi(page, fixture, name, `SN-${Date.now()}`);

    await expect(toast(page, 'Activo creado')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await expect(page.getByText(/^INV-\d{6}$/)).toBeVisible();
    await expect(page.getByText('Disponible', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/\$\s?1\.23[45]/)).toBeVisible();
    await eachTheme(page, () => expectNoA11yViolations(page));
    expect(await horizontalOverflow(page)).toBe(false);
  });

  test('un formulario con cambios avisa al navegar fuera, recargar o cerrar un diálogo [P15]', async ({
    page,
  }) => {
    await page.goto('/activos/nuevo');
    await page.getByLabel('Nombre', { exact: false }).first().fill('Borrador sin guardar');

    // Navegar dentro de la app: el guardián del router pregunta.
    await page.getByRole('link', { name: 'Activos' }).first().click();
    const ask = page.getByRole('dialog', { name: 'Cambios sin guardar' });
    await expect(ask).toBeVisible();
    await expectNoA11yViolations(page);
    await ask.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(page).toHaveURL(/\/activos\/nuevo$/);
    await expect(page.getByLabel('Nombre', { exact: false }).first()).toHaveValue(
      'Borrador sin guardar',
    );

    // Recargar o cerrar: con cambios, la página cancela el evento beforeunload (el navegador pregunta).
    const prevented = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);

    // Descartar sí sale.
    await page.getByRole('link', { name: 'Activos' }).first().click();
    await ask.getByRole('button', { name: 'Descartar cambios' }).click();
    await expect(page).toHaveURL(/\/activos$/);
  });

  test('un diálogo con cambios pide confirmar antes de cerrarse [P15]', async ({ page }) => {
    await page.goto('/catalogo/manufacturers');
    await page.getByRole('button', { name: 'Nuevo fabricante' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nuevo fabricante' });
    await dialog.getByLabel('Nombre').fill('A medias');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    const ask = page.getByRole('dialog', { name: 'Cambios sin guardar' });
    await expect(ask).toBeVisible();
    await ask.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(dialog.getByLabel('Nombre')).toHaveValue('A medias');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await ask.getByRole('button', { name: 'Descartar cambios' }).click();
    await expect(dialog).toBeHidden();
    // Sin cambios, cerrar no pregunta.
    await page.getByRole('button', { name: 'Nuevo fabricante' }).click();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('alta en lote: crea N activos con series, rechaza duplicadas y pasa axe [P16]', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const stamp = Date.now().toString(36);
    await page.goto('/activos/nuevo');
    await page.getByRole('link', { name: 'Alta en lote' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Alta en lote' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Estado/ })).toContainText(
      'Pendiente de configuración',
    );
    expect(await horizontalOverflow(page)).toBe(false);
    await eachTheme(page, () => expectNoA11yViolations(page));

    await pick(page, page.locator('form'), /^Modelo/, fixture.modelName);
    await pick(page, page.locator('form'), /^Ubicación base/, fixture.locationName);
    await page.getByLabel('Cantidad').fill('3');
    await page.getByLabel('Números de serie').fill(`L-${stamp}-1\nL-${stamp}-2`);
    await page.getByRole('button', { name: 'Crear activos' }).click();
    await expect(page.getByText(/La cantidad de series debe coincidir/)).toBeVisible();

    await page.getByLabel('Números de serie').fill(`L-${stamp}-1\nl-${stamp}-1\nL-${stamp}-3`);
    await page.getByRole('button', { name: 'Crear activos' }).click();
    await expect(page.getByText(/Hay series repetidas/)).toBeVisible();

    await page.getByLabel('Números de serie').fill(`L-${stamp}-1\nL-${stamp}-2\nL-${stamp}-3`);
    await page.getByRole('button', { name: 'Crear activos' }).click();
    await expect(toast(page, /Se crearon 3 activos/)).toBeVisible();
    await expect(page).toHaveURL(/\/activos\?/);

    // Repetir las mismas series: ya existen en la base.
    await page.goto('/activos/lote');
    await pick(page, page.locator('form'), /^Modelo/, fixture.modelName);
    await pick(page, page.locator('form'), /^Ubicación base/, fixture.locationName);
    await page.getByLabel('Cantidad').fill('1');
    await page.getByLabel('Números de serie').fill(`L-${stamp}-2`);
    await page.getByRole('button', { name: 'Crear activos' }).click();
    await expect(page.getByText(/Ya existen activos con estas series/)).toBeVisible();
  });

  test('las acciones principales se ven sin hacer scroll (RF-41)', async ({ page }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    await page.goto(`/activos/${asset.id}`);
    for (const name of ['Asignar', 'Cambiar estado', 'Editar']) {
      const button = page.getByRole('button', { name }).or(page.getByRole('link', { name }));
      await expect(button.first()).toBeVisible();
      const box = (await button.first().boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(
        box.y + box.height,
        `${name} debe estar dentro de la primera pantalla`,
      ).toBeLessThanOrEqual(viewport.height);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('editar datos, cambiar estado y ver el historial con antes/después', async ({ page }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    await page.goto(`/activos/${asset.id}`);

    await page.getByRole('link', { name: 'Editar' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Editar activo' })).toBeVisible();
    // El estado ya no se edita aquí: solo con «Cambiar estado» [P23].
    await expect(page.getByRole('button', { name: /^Estado/ })).toHaveCount(0);
    const renamed = `${asset.name} v2`;
    await page.getByLabel('Nombre').first().fill(renamed);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Cambios guardados')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();

    await page.getByRole('button', { name: 'Cambiar estado' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cambiar estado' });
    await expectNoA11yViolations(page); // diálogo abierto
    await pick(page, dialog, /^Nuevo estado/, 'En reparación');
    await dialog.getByLabel('Nota').fill('Pantalla rota');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Estado actualizado')).toBeVisible();
    await expect(page.getByText('En reparación', { exact: true }).first()).toBeVisible();
    // En reparación no es desplegable: ya no se ofrece asignar.
    await expect(page.getByRole('button', { name: 'Asignar' })).toHaveCount(0);

    const history = page.getByRole('region', { name: 'Historial' });
    await expect(history.getByText('Edición', { exact: true }).first()).toBeVisible();
    await expect(history.getByText('Alta', { exact: true })).toBeVisible();
    await expect(history.getByText('Cambio de estado', { exact: true })).toBeVisible();
    await expect(history.getByText('Pantalla rota')).toBeVisible();
    await expect(history.getByText(asset.name, { exact: true })).toBeVisible();
    // Fechas en el formato único de la app: dd-mm-aaaa HH:mm (24 h).
    await expect(history.getByText(/\b\d{2}-\d{2}-\d{4} \d{2}:\d{2}\b/).first()).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('asignar a una persona y devolver, con diálogos y selectores abiertos en axe', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    await page.goto(`/activos/${asset.id}`);

    for (const theme of ['light', 'dark'] as const) {
      await page.getByRole('button', { name: 'Asignar' }).click();
      const dialog = page.getByRole('dialog', { name: 'Asignar activo' });
      await expectNoA11yViolations(page);
      await dialog.getByRole('button', { name: /^Persona/ }).click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await expectNoA11yViolations(page); // selector abierto dentro del diálogo
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      if (theme === 'light') {
        await chooseUserMenu(page, 'Cambiar a modo oscuro');
        await expect(page.locator('html')).toHaveClass(/\bdark\b/);
      }
    }

    await page.getByRole('button', { name: 'Asignar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Asignar activo' });
    await pick(page, dialog, /^Persona/, 'Admin E2E');
    await dialog.getByLabel('Devolución esperada').fill('2030-12-31');
    await dialog.getByLabel('Nota').fill('Para terreno');
    await dialog.getByRole('button', { name: 'Asignar' }).click();
    await expect(toast(page, 'Activo asignado')).toBeVisible();
    await expect(page.getByText('Asignado', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Asignación actual' })).toContainText(
      'Admin E2E',
    );
    await expect(page.getByRole('region', { name: 'Asignación actual' })).toContainText(
      '31-12-2030',
    );
    // Con una persona la ubicación actual deja de ser la bodega.
    await expect(page.getByText(/Con Admin E2E/).first()).toBeVisible();
    // Asignado: no se cambia el estado ni se da de baja hasta devolverlo.
    await expect(page.getByRole('button', { name: 'Cambiar estado' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dar de baja' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Devolver' }).click();
    const back = page.getByRole('dialog', { name: 'Devolver activo' });
    // «Devolver a» es obligatorio y parte en la bodega base del activo.
    await expect(back.getByRole('button', { name: /^Devolver a/ })).toContainText(
      fixture.locationName,
    );
    await pick(page, back, /^Estado al devolver/, 'Disponible');
    await back.getByLabel('Nota').fill('Vuelve en buen estado');
    await back.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Activo devuelto')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Asignar' })).toBeVisible();

    const history = page.getByRole('region', { name: 'Historial' });
    await expect(history.getByText('Asignado a Admin E2E')).toBeVisible();
    await expect(history.getByText('Devolución', { exact: true })).toBeVisible();
  });

  test('el historial muestra 10 movimientos y «Ver más» trae el resto, sin scroll interno', async ({
    page,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    for (let i = 1; i <= 11; i += 1) {
      await apiPatchAsset(page.request, asset.id, { notes: `Cambio ${i}` });
    }
    await page.goto(`/activos/${asset.id}`);
    const history = page.getByRole('region', { name: 'Historial' });
    await expect(history.locator('ol > li')).toHaveCount(10);
    const overflow = await history.evaluate((el) => getComputedStyle(el).overflowY);
    expect(overflow).toBe('visible');
    await history.getByRole('button', { name: 'Ver más' }).click();
    await expect(history.locator('ol > li')).toHaveCount(12); // 11 cambios + el alta
    await expect(history.getByRole('button', { name: 'Ver más' })).toHaveCount(0);
    await expectNoA11yViolations(page);
  });

  test('dar de baja con motivo, verlo en la papelera y restaurarlo', async ({ page }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    await page.goto(`/activos/${asset.id}`);

    await page.getByRole('button', { name: 'Dar de baja' }).click();
    const dialog = page.getByRole('dialog', { name: 'Dar de baja el activo' });
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Dar de baja' }).click();
    await expect(dialog.getByText('Este campo es obligatorio')).toBeVisible(); // el motivo es obligatorio
    await dialog.getByLabel('Motivo').fill('Equipo robado');
    await dialog.getByRole('button', { name: 'Dar de baja' }).click();
    await expect(toast(page, 'Activo dado de baja')).toBeVisible();
    await expect(page.getByText('Dado de baja').first()).toBeVisible();
    await expect(page.getByText('Equipo robado').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0);

    await page.goto(`/activos?q=${asset.serial}`);
    await expect(visibleText(page, 'No hay resultados para esta búsqueda')).toBeVisible();
    await page.goto(`/activos?q=${asset.serial}&deleted=only`);
    await expect(
      page.getByRole('link', { name: new RegExp(asset.assetTag) }).first(),
    ).toBeVisible();

    await page.goto(`/activos/${asset.id}`);
    await page.getByRole('button', { name: 'Restaurar' }).click();
    const confirm = page.getByRole('dialog', { name: 'Restaurar' });
    await expectNoA11yViolations(page);
    await confirm.getByRole('button', { name: 'Restaurar' }).click();
    await expect(toast(page, 'Activo restaurado')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Editar' })).toBeVisible();
  });
});

test.describe('listado de activos (RF-22, RF-26, RF-40)', () => {
  test('búsqueda y filtros viven en la URL y sobreviven a recargar; axe en claro y oscuro', async ({
    page,
  }, info) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    await createAssetViaApi(page.request, fixture); // otro activo del mismo modelo que no debe coincidir

    await page.goto('/activos');
    await expect(page.getByRole('heading', { level: 1, name: 'Activos' })).toBeVisible();
    await page.getByRole('searchbox', { name: /Buscar por etiqueta/ }).fill(asset.serial);
    await expect(page).toHaveURL(new RegExp(`q=${asset.serial}`));
    const link = page.getByRole('link', { name: new RegExp(asset.assetTag) });
    await expect(link.first()).toBeVisible();
    await expect(page.getByText('1 resultado')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('searchbox', { name: /Buscar por etiqueta/ })).toHaveValue(
      asset.serial,
    );
    await expect(page.getByText('1 resultado')).toBeVisible();
    expect(await horizontalOverflow(page)).toBe(false);

    if (info.project.name === 'mobile') {
      // En 360 px el listado son tarjetas, no tabla (RF-40).
      await expect(page.getByRole('table')).toBeHidden();
      await expect(page.locator('ul a[href^="/activos/"]').first()).toBeVisible();
      await page.getByRole('button', { name: 'Filtros' }).click();
    } else {
      await expect(page.getByRole('table')).toBeVisible();
    }

    // Modelo está tras «Más filtros»; a la vista solo hay Estado, Categoría y Ubicación base [P22].
    await expect(page.getByRole('button', { name: /^Categoría/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Modelo/ })).toBeHidden();
    await page.getByRole('button', { name: 'Más filtros' }).click();
    await page.getByRole('button', { name: /^Modelo/ }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectNoA11yViolations(page); // filtro con búsqueda ABIERTO
    await page.getByPlaceholder(/Buscar…/).fill(fixture.modelName.slice(0, 14));
    await page.getByRole('option', { name: fixture.modelName }).click();
    await expect(page).toHaveURL(new RegExp(`modelId=${fixture.modelId}`));
    await page.reload();
    // Con filtros en la URL el panel ya viene abierto; en móvil solo se abre si sigue cerrado.
    const toggle = page.getByRole('button', { name: 'Filtros', exact: true });
    if (info.project.name === 'mobile' && (await toggle.getAttribute('aria-expanded')) !== 'true')
      await toggle.click();
    // El nombre accesible del selector es su rótulo; lo elegido se lee en su contenido.
    await expect(page.getByRole('button', { name: /^Modelo/ })).toContainText(
      fixture.modelName.slice(0, 20),
    );

    await eachTheme(page, () => expectNoA11yViolations(page));
  });

  test('«Limpiar filtros» sin filtros activos está atenuado, no tachado [P26]', async ({
    page,
  }, info) => {
    await page.goto('/activos');
    if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Filtros' }).click();
    const clear = page.getByRole('button', { name: 'Limpiar filtros' });
    await expect(clear).toBeDisabled();
    const style = await clear.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { line: cs.textDecorationLine, opacity: Number(cs.opacity), cursor: cs.cursor };
    });
    expect(style.line).toBe('none');
    expect(style.opacity).toBeLessThan(1);
    expect(style.cursor).not.toBe('not-allowed');

    await page.goto('/activos?statusKind=deployable');
    if (
      info.project.name === 'mobile' &&
      (await page
        .getByRole('button', { name: 'Filtros', exact: true })
        .getAttribute('aria-expanded')) !== 'true'
    ) {
      await page.getByRole('button', { name: 'Filtros' }).click();
    }
    await expect(page.getByRole('button', { name: 'Limpiar filtros' })).toBeEnabled();
  });

  test('orden, tamaño de página y paginación del lado servidor', async ({ page }) => {
    const fixture = await createCatalogFixture(page.request);
    for (let i = 0; i < 3; i += 1) await createAssetViaApi(page.request, fixture);
    await page.goto(`/activos?modelId=${fixture.modelId}&pageSize=10&sort=-name`);
    await expect(page.getByText('3 resultados')).toBeVisible();
    await page.getByRole('combobox', { name: 'Ordenar' }).click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expectNoA11yViolations(page); // select de orden ABIERTO
    await page.getByRole('option', { name: 'Nombre ↑' }).click();
    await expect(page).toHaveURL(/sort=name/);
    await page.goto(`/activos?modelId=${fixture.modelId}&pageSize=10&page=9`);
    await expect(page.getByText('3 resultados')).toBeVisible();
  });

  test('exportar CSV descarga el listado filtrado sin claves', async ({ page }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    const res = await page.request.get(`/api/v1/assets/export?q=${asset.serial}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/csv');
    const body = (await res.text()).replace(/^\uFEFF/, '');
    const lines = body.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(asset.assetTag);

    await page.goto(`/activos?q=${asset.serial}`);
    const link = page.getByRole('link', { name: 'Exportar CSV' });
    await expect(link).toHaveAttribute(
      'href',
      new RegExp(`/api/v1/assets/export\\?q=${asset.serial}`),
    );
  });
});

test.describe('permisos en la UI de inventario', () => {
  test('un lector ve activos y catálogo pero ninguna acción de escritura', async ({
    page,
    playwright,
    baseURL,
  }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    const reader = await provisionUser(
      page.request,
      () => playwright.request.newContext({ baseURL: baseURL! }),
      { role: 'Lector', prefix: 'lector' },
    );
    const other = await page.context().browser()!.newContext({ baseURL: baseURL! });
    const p = await other.newPage();
    await loginViaApiPage(p, reader.email, reader.password);

    await p.goto('/activos');
    await expect(p.getByRole('link', { name: 'Nuevo activo' })).toHaveCount(0);
    await p.goto(`/activos/${asset.id}`);
    await expect(p.getByRole('heading', { level: 1, name: asset.name })).toBeVisible();
    for (const name of ['Asignar', 'Cambiar estado', 'Editar', 'Dar de baja']) {
      await expect(p.getByRole('button', { name }).or(p.getByRole('link', { name }))).toHaveCount(
        0,
      );
    }
    await p.goto('/activos/nuevo');
    await expect(
      p.getByRole('heading', { name: 'No tienes permiso para ver esta página' }),
    ).toBeVisible();
    await p.goto('/catalogo/categories');
    await expect(p.getByRole('button', { name: /^Nueva categoría/ })).toHaveCount(0);
    await other.close();
  });

  test('un técnico de campo asigna pero no edita', async ({ page, playwright, baseURL }) => {
    const fixture = await createCatalogFixture(page.request);
    const asset = await createAssetViaApi(page.request, fixture);
    const tech = await provisionUser(
      page.request,
      () => playwright.request.newContext({ baseURL: baseURL! }),
      { role: 'Técnico de campo', prefix: 'tecnico' },
    );
    const other = await page.context().browser()!.newContext({ baseURL: baseURL! });
    const p = await other.newPage();
    await loginViaApiPage(p, tech.email, tech.password);
    await p.goto(`/activos/${asset.id}`);
    await expect(p.getByRole('button', { name: 'Asignar' })).toBeVisible();
    await expect(p.getByRole('link', { name: 'Editar' })).toHaveCount(0);
    await expect(p.getByRole('button', { name: 'Dar de baja' })).toHaveCount(0);
    await other.close();
  });
});

test.describe('app instalable (RF-42)', () => {
  test('publica un manifest con nombre, íconos e idioma, y el aviso sin conexión', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    const manifest = await (await page.request.get(href!)).json();
    expect(manifest).toMatchObject({ name: 'Inventarius', display: 'standalone', lang: 'es-CL' });
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    for (const icon of manifest.icons as { src: string }[]) {
      const res = await page.request.get(icon.src);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }

    await expect(page.getByRole('status').filter({ hasText: 'Sin conexión' })).toHaveCount(0);
    await context.setOffline(true);
    await expect(page.getByRole('status').filter({ hasText: 'Sin conexión' })).toBeVisible();
    await expectNoA11yViolations(page);
    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'Sin conexión' })).toHaveCount(0);
  });
});

async function loginViaApiPage(page: Page, email: string, password: string): Promise<void> {
  await loginViaApi(page.request, email, password);
}
