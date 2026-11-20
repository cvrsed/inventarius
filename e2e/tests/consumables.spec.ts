import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN,
  apiPost,
  eachTheme,
  expectNoA11yViolations,
  horizontalOverflow,
  loginViaApi,
  loginViaUi,
  provisionUser,
  uniqueName,
} from './support';

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

interface Fixture {
  id: string;
  name: string;
  main: { id: string; name: string };
  annex: { id: string; name: string };
}

/** Categoría de consumibles, dos bodegas y un consumible en pares con mínimo 10 (todo con datos inventados). */
async function createFixture(page: Page): Promise<Fixture> {
  const request = page.request;
  const category = await apiPost<{ id: string }>(request, '/api/v1/categories', {
    name: uniqueName('EPP'),
    scope: 'consumable',
  });
  const main = { name: uniqueName('Bodega central') } as { id: string; name: string };
  main.id = (
    await apiPost<{ id: string }>(request, '/api/v1/locations', {
      name: main.name,
      type: 'warehouse',
    })
  ).id;
  const annex = { name: uniqueName('Bodega anexo') } as { id: string; name: string };
  annex.id = (
    await apiPost<{ id: string }>(request, '/api/v1/locations', {
      name: annex.name,
      type: 'warehouse',
    })
  ).id;
  const units = (await (await request.get('/api/v1/measure-units?pageSize=100')).json()) as {
    data: { id: string; name: string }[];
  };
  const name = uniqueName('Guantes');
  const created = await apiPost<{ id: string }>(request, '/api/v1/consumables', {
    name,
    categoryId: category.id,
    unitId: units.data.find((u) => u.name === 'par')!.id,
    minStock: '10',
  });
  return { id: created.id, name, main, annex };
}

const toast = (page: Page, text: string | RegExp) =>
  page
    .getByLabel(/^Notificaciones/)
    .getByText(text)
    .first();

/** La tabla (escritorio) y las tarjetas (móvil) no coexisten; se busca solo lo visible. */
const visibleText = (page: Page, text: string | RegExp) =>
  page.getByText(text).locator('visible=true');

/** Elige una bodega en un selector con búsqueda dentro del diálogo. */
async function pickWarehouse(page: Page, name: string, label = /^Bodega\*/): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: label }).click();
  await page.getByPlaceholder(/Buscar…/).fill(name.slice(0, 18));
  await page.getByRole('option', { name }).click();
  await expect(page.getByRole('listbox')).toBeHidden();
}

/** Saldo de cada bodega según la ficha (lo que ve el usuario) y según el libro (la suma de todos los movimientos). */
async function stockVsLedger(page: Page, id: string) {
  const detail = (await (await page.request.get(`/api/v1/consumables/${id}`)).json()) as {
    totalStock: string;
    stockByWarehouse: { location: { id: string }; quantity: string }[];
  };
  const ledger = new Map<string, number>();
  for (let p = 1; ; p++) {
    const res = (await (
      await page.request.get(`/api/v1/consumables/${id}/movements?pageSize=100&page=${p}`)
    ).json()) as {
      data: { location: { id: string }; delta: string }[];
      meta: { total: number; pageSize: number; page: number };
    };
    for (const m of res.data) {
      ledger.set(m.location.id, (ledger.get(m.location.id) ?? 0) + Number(m.delta));
    }
    if (res.meta.page * res.meta.pageSize >= res.meta.total) break;
  }
  const stock = new Map(detail.stockByWarehouse.map((s) => [s.location.id, Number(s.quantity)]));
  return { detail, stock, ledger };
}

test.describe('consumables (RF-70 a RF-74)', () => {
  test('ciclo ingreso → entrega → traslado → ajuste → aviso de mínimo → anulación, con el libro cuadrado', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const f = await createFixture(page);
    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByRole('heading', { level: 1, name: f.name })).toBeVisible();
    // Sin stock ya está bajo su mínimo (10) y entregar o trasladar no tiene sentido todavía.
    await expect(
      page.getByText('El total (0 pares) está bajo el mínimo (10 pares).'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entregar' })).toBeDisabled();

    // Ingreso de 12 pares a la bodega central.
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expectNoA11yViolations(page); // diálogo abierto
    await pickWarehouse(page, f.main.name);
    await page.getByLabel('Cantidad', { exact: false }).first().fill('12');
    await page.getByLabel('Proveedor').fill('Proveedor Ficticio SpA');
    await page.getByRole('button', { name: 'Registrar ingreso' }).click();
    await expect(toast(page, 'Ingreso registrado')).toBeVisible();
    await expect(visibleText(page, '12 pares').first()).toBeVisible();
    await expect(page.getByText('El total (12 pares)')).toHaveCount(0);

    // La entrega no puede pasar del stock de la bodega: se ve el tope y el error antes de enviar.
    await page.getByRole('button', { name: 'Entregar' }).click();
    await expect(page.getByText('Máximo disponible en esta bodega: 12 pares')).toBeVisible();
    await page.getByLabel('Cantidad', { exact: false }).first().fill('13');
    await page.getByRole('combobox', { name: 'Quién recibe' }).click();
    await page.getByRole('option', { name: 'Otra persona (nombre escrito)' }).click();
    await page.getByLabel('Nombre de quien recibe').fill('Persona Inventada');
    await page.getByLabel('Identificador (opcional)').fill('ID-000');
    await page.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(page.getByText('No puede superar lo disponible: 12 pares')).toBeVisible();
    await page.getByLabel('Cantidad', { exact: false }).first().fill('3');
    await page.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(toast(page, 'Entrega registrada')).toBeVisible();
    await expect(page.getByText('Persona Inventada (ID-000)')).toBeVisible();

    // Traslado de 4 pares a la bodega anexo.
    await page.getByRole('button', { name: 'Trasladar' }).click();
    await pickWarehouse(page, f.annex.name, /^Bodega de destino/);
    await page.getByLabel('Cantidad', { exact: false }).first().fill('4');
    await page.getByRole('button', { name: 'Registrar traslado' }).click();
    await expect(toast(page, 'Traslado registrado')).toBeVisible();
    await expect(page.getByText(`${f.main.name} → ${f.annex.name}`).first()).toBeVisible();

    // Ajuste (resta 1 en la anexo): pide confirmar mostrando el saldo antes y después.
    await page.getByRole('button', { name: 'Ajustar' }).click();
    await pickWarehouse(page, f.annex.name);
    await page.getByLabel('Cantidad', { exact: false }).first().fill('1');
    await page.getByRole('combobox', { name: 'Motivo' }).click();
    await page.getByRole('option', { name: 'Merma o daño' }).click();
    await page.getByRole('button', { name: 'Revisar ajuste' }).click();
    const confirm = page.getByRole('dialog', { name: 'Confirmar ajuste' });
    await expect(confirm).toContainText('de 4 pares a 3 pares');
    await expectNoA11yViolations(page); // confirmación abierta
    await confirm.getByRole('button', { name: 'Confirmar ajuste' }).click();
    await expect(toast(page, 'Ajuste registrado')).toBeVisible();

    // Quedan 8 pares (5 + 3): bajo el mínimo de 10 → aviso en Inicio con enlace al listado filtrado.
    await expect(
      page.getByText('El total (8 pares) está bajo el mínimo (10 pares).'),
    ).toBeVisible();
    await page.goto('/');
    const notice = page.getByRole('link', { name: /consumibles? bajo su mínimo/ });
    await expect(notice).toBeVisible();
    await notice.click();
    await expect(page).toHaveURL(/\/consumibles\?lowStock=true/);
    // La base de e2e es compartida: se acota por nombre para no depender de qué más esté bajo su mínimo.
    await page.goto(`/consumibles?lowStock=true&q=${encodeURIComponent(f.name)}`);
    await expect(visibleText(page, f.name).first()).toBeVisible();

    // Se anula la entrega: el stock vuelve (+3) y ambos movimientos quedan enlazados.
    await page.goto(`/consumibles/${f.id}`);
    await page.getByRole('button', { name: /^Anular Entrega/ }).click();
    const reverse = page.getByRole('dialog', { name: 'Anular movimiento' });
    await expect(reverse).toContainText(`En ${f.main.name} el stock pasará de 5 pares a 8 pares`);
    await reverse.getByRole('button', { name: 'Anular movimiento' }).click();
    await expect(reverse.getByText('Este campo es obligatorio')).toBeVisible();
    await reverse.getByLabel('Motivo de la anulación').fill('Entrega duplicada');
    await expectNoA11yViolations(page);
    await reverse.getByRole('button', { name: 'Anular movimiento' }).click();
    await expect(toast(page, 'Movimiento anulado')).toBeVisible();
    await expect(page.getByText(/Anulado por .* el \d{2}-\d{2}-\d{4} \d{2}:\d{2}/)).toBeVisible();
    await expect(page.getByText(/Anula entrega del \d{2}-\d{2}-\d{4}/)).toBeVisible();
    // Con 11 pares ya no avisa.
    await expect(page.getByText(/está bajo el mínimo/)).toHaveCount(0);

    // El stock que muestra la pantalla es el del libro: la suma de los movimientos de cada bodega.
    const { detail, stock, ledger } = await stockVsLedger(page, f.id);
    expect(detail.totalStock).toBe('11');
    expect(stock.get(f.main.id)).toBe(8);
    expect(stock.get(f.annex.id)).toBe(3);
    for (const [location, quantity] of stock) expect(ledger.get(location) ?? 0).toBe(quantity);
    expect(ledger.size).toBe(stock.size);
    await expect(visibleText(page, '11 pares').first()).toBeVisible();
  });

  test('anular un ingreso cuyo stock ya se entregó se rechaza con un mensaje claro', async ({
    page,
  }) => {
    const f = await createFixture(page);
    const receipt = await apiPost<{ movements: { id: string }[] }>(
      page.request,
      `/api/v1/consumables/${f.id}/receipts`,
      { locationId: f.main.id, quantity: '5' },
    );
    expect(receipt.movements).toHaveLength(1);
    await apiPost(page.request, `/api/v1/consumables/${f.id}/deliveries`, {
      locationId: f.main.id,
      quantity: '4',
      recipientName: 'Persona Inventada',
    });
    await page.goto(`/consumibles/${f.id}`);
    await page.getByRole('button', { name: /^Anular Ingreso/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Anular movimiento' });
    await expect(dialog).toContainText('dejaría el stock en negativo');
    await expect(dialog.getByRole('button', { name: 'Anular movimiento' })).toBeDisabled();
  });

  test('un operador sin consumables:adjust no ve «Ajustar» ni «Anular»; quien solo lee no ve acciones', async ({
    page,
    playwright,
  }) => {
    const f = await createFixture(page);
    await apiPost(page.request, `/api/v1/consumables/${f.id}/receipts`, {
      locationId: f.main.id,
      quantity: '5',
    });
    const context = () =>
      playwright.request.newContext({
        baseURL: process.env['BASE_URL'] ?? 'http://localhost:8080',
      });
    const operator = await provisionUser(page.request, context, {
      role: 'Operador',
      prefix: 'op-cons',
    });
    const reader = await provisionUser(page.request, context, {
      role: 'Lector',
      prefix: 'lec-cons',
    });

    await page.context().clearCookies();
    await loginViaUi(page, operator.email, operator.password);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajustar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Anular/ })).toHaveCount(0);

    await page.context().clearCookies();
    await loginViaUi(page, reader.email, reader.password);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByRole('heading', { level: 1, name: f.name })).toBeVisible();
    for (const name of ['Ingresar', 'Entregar', 'Trasladar', 'Ajustar', 'Editar']) {
      await expect(page.getByRole('button', { name })).toHaveCount(0);
    }
  });

  test('listado y ficha: sin desborde horizontal y sin violaciones de axe en claro y oscuro', async ({
    page,
  }) => {
    const f = await createFixture(page);
    await apiPost(page.request, `/api/v1/consumables/${f.id}/receipts`, {
      locationId: f.main.id,
      quantity: '5',
    });
    await page.goto('/consumibles');
    await page.getByPlaceholder('Buscar por nombre').fill(f.name);
    await expect(page).toHaveURL(/q=/);
    await expect(visibleText(page, f.name).first()).toBeVisible();
    await eachTheme(page, () => expectNoA11yViolations(page));
    expect(await horizontalOverflow(page)).toBe(false);

    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByRole('heading', { level: 1, name: f.name })).toBeVisible();
    await eachTheme(page, () => expectNoA11yViolations(page));
    expect(await horizontalOverflow(page)).toBe(false);

    await page.getByRole('button', { name: 'Entregar' }).click();
    await expectNoA11yViolations(page);
    expect(await horizontalOverflow(page)).toBe(false);
  });

  test('las unidades y las categorías de consumibles se administran en el catálogo', async ({
    page,
  }) => {
    await page.goto('/catalogo/units');
    await expect(visibleText(page, 'litros').first()).toBeVisible();
    await expect(visibleText(page, 'pares').first()).toBeVisible();
    await expectNoA11yViolations(page);
    expect(await horizontalOverflow(page)).toBe(false);
    await page.goto('/catalogo/consumableCategories');
    await expect(
      page.getByRole('button', { name: 'Nueva categoría de consumibles' }),
    ).toBeVisible();
    await expectNoA11yViolations(page);
  });
});
