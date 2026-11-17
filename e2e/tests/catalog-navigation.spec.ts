import { expect, test } from '@playwright/test';
import { ADMIN, apiPost, loginViaApi, statusIdByName, uniqueName } from './support';

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

/**
 * [P30] Secuencia que congelaba la app: Catálogo en 360 px, varios cambios de sección con el select, paso a
 * escritorio sin recargar, clic en varias pestañas y, al final, «Inicio». Causa raíz: `keepPreviousData` dejaba
 * las filas de la sección anterior mientras cargaba la nueva y la plantilla de la sección nueva las leía mal
 * (`catalog.kinds.undefined`, `manufacturer` de un registro que no es modelo): el render lanzaba un TypeError
 * y la vista quedaba pegada. Las respuestas se retrasan para que el cruce ocurra siempre.
 */
test('cambiar de sección en 360 px y en escritorio muestra los datos de cada una y deja volver a Inicio [P30]', async ({
  page,
}) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (['warning', 'error'].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  // Un registro reconocible por sección.
  const stamp = uniqueName('Nav');
  const manufacturer = await apiPost<{ id: string }>(page.request, '/api/v1/manufacturers', {
    name: `${stamp} Fab`,
  });
  const category = await apiPost<{ id: string }>(page.request, '/api/v1/categories', {
    name: `${stamp} Cat`,
  });
  await apiPost(page.request, '/api/v1/models', {
    name: `${stamp} Mod`,
    manufacturerId: manufacturer.id,
    categoryId: category.id,
  });
  await apiPost(page.request, '/api/v1/locations', { name: `${stamp} Loc`, type: 'warehouse' });
  await apiPost(page.request, '/api/v1/status-labels', { name: `${stamp} Est`, kind: 'pending' });
  expect(await statusIdByName(page.request, `${stamp} Est`)).toBeTruthy();

  // Respuestas lentas: la vista siempre pasa por el estado «cargando la sección nueva».
  await page.route(
    /\/api\/v1\/(categories|manufacturers|models|locations|status-labels)\?/,
    async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.continue();
    },
  );

  const SECTIONS: [string, string, string][] = [
    ['Categorías', 'Cat', 'categories'],
    ['Fabricantes', 'Fab', 'manufacturers'],
    ['Modelos', 'Mod', 'models'],
    ['Ubicaciones', 'Loc', 'locations'],
    ['Estados', 'Est', 'statuses'],
  ];
  // a) 360 px
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/catalogo');
  await expect(page.getByRole('combobox', { name: 'Sección del catálogo' })).toBeVisible();

  // b) cambiar de sección con el select varias veces
  for (const [name] of [SECTIONS[3]!, SECTIONS[2]!, SECTIONS[4]!, SECTIONS[0]!, SECTIONS[3]!]) {
    await page.getByRole('combobox', { name: 'Sección del catálogo' }).click();
    await page.getByRole('option', { name, exact: true }).click();
    await expect(page.getByRole('listbox')).toBeHidden();
  }

  // c) a escritorio sin recargar
  await page.setViewportSize({ width: 1280, height: 800 });
  const tabs = page.getByRole('navigation', { name: 'Secciones del catálogo' });
  await expect(tabs).toBeVisible();

  // d) clic en varias pestañas, con datos correctos en cada una
  for (const [label, suffix, slug] of [...SECTIONS, SECTIONS[0]!, SECTIONS[3]!, SECTIONS[2]!]) {
    await tabs.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/catalogo/${slug}`));
    await expect(tabs.locator('a[aria-current="page"]')).toHaveText(label);
    await page.getByRole('searchbox').fill(`${stamp} ${suffix}`);
    await expect(page.getByRole('row').filter({ hasText: `${stamp} ${suffix}` })).toHaveCount(1);
    // Ninguna fila de otra sección.
    // (la fila de un modelo muestra legítimamente su fabricante y su categoría.)
    const foreign = SECTIONS.filter(
      ([, s]) => s !== suffix && !(suffix === 'Mod' && ['Fab', 'Cat'].includes(s)),
    );
    for (const [, other] of foreign) {
      await expect(page.getByText(`${stamp} ${other}`)).toHaveCount(0);
    }
  }

  // e) «Inicio» en el menú lateral debe llevar a Inicio
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Inicio' })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();

  expect(problems.filter((p) => /intlify|undefined|pageerror|TypeError/i.test(p))).toEqual([]);
});
