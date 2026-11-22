import { expect, test, type Page } from '@playwright/test';
import {
  ADMIN,
  apiPatch,
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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Elige una bodega en el selector del diálogo. Cada opción lleva nombre, ruta y stock (P13): se la busca por su nombre.
 */
async function pickWarehouse(page: Page, name: string, label = /^Bodega\*/): Promise<void> {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: label }).click();
  await page.getByPlaceholder('Buscar bodega…').fill(name.slice(0, 18));
  await page.getByRole('option', { name: new RegExp(escapeRegExp(name)) }).click();
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
      data: {
        location: { id: string };
        counterpartLocation: { id: string } | null;
        delta: string;
      }[];
      meta: { total: number; pageSize: number; page: number };
    };
    for (const m of res.data) {
      // Un traslado (y su anulación) es una sola entrada del historial (P8): mueve la cantidad entre sus dos bodegas.
      ledger.set(m.location.id, (ledger.get(m.location.id) ?? 0) + Number(m.delta));
      if (m.counterpartLocation) {
        const other = m.counterpartLocation.id;
        ledger.set(other, (ledger.get(other) ?? 0) - Number(m.delta));
      }
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
      page.getByText('El total (0 pares) está bajo el mínimo global (10 pares).'),
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
    // D6: confirmación estructurada con el saldo destacado.
    await expect(confirm.locator('[data-highlight="true"]')).toHaveText('4 → 3');
    await expect(confirm).toContainText('Queda en el libro y no se puede editar');
    await expectNoA11yViolations(page); // confirmación abierta
    await confirm.getByRole('button', { name: 'Confirmar ajuste' }).click();
    await expect(toast(page, 'Ajuste registrado')).toBeVisible();

    // Quedan 8 pares (5 + 3): bajo el mínimo de 10 → aviso en Inicio con enlace al listado filtrado.
    await expect(
      page.getByText('El total (8 pares) está bajo el mínimo global (10 pares).'),
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

  test('el operador ajusta pero no anula (P2); quien solo lee no ve acciones', async ({
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
    await expect(page.getByRole('button', { name: 'Ajustar' })).toBeVisible();
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

  test('devolución: «Devuelto x de y», tope de lo entregado y la entrega no se anula con devoluciones vigentes (P1)', async ({
    page,
  }) => {
    const f = await createFixture(page);
    await apiPost(page.request, `/api/v1/consumables/${f.id}/receipts`, {
      locationId: f.main.id,
      quantity: '10',
    });
    await apiPost(page.request, `/api/v1/consumables/${f.id}/deliveries`, {
      locationId: f.main.id,
      quantity: '4',
      recipientName: 'Persona Inventada',
      recipientRef: 'ID-777',
    });
    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByRole('button', { name: /^Anular Entrega/ })).toBeVisible();

    await page.getByRole('button', { name: /^Registrar devolución/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Registrar devolución' });
    await expect(dialog).toContainText('Persona Inventada');
    await expect(dialog).toContainText('Quedan por devolver 4 pares');
    // Nada en rojo hasta que se interactúa (P15).
    await expect(dialog.getByText('Este campo es obligatorio')).toHaveCount(0);
    await dialog.getByLabel('Cantidad a devolver', { exact: false }).fill('5');
    await dialog.getByRole('button', { name: 'Registrar devolución' }).click();
    await expect(
      dialog.getByText('No puede superar lo pendiente de devolver (4 pares)'),
    ).toBeVisible();
    await dialog.getByLabel('Cantidad a devolver', { exact: false }).fill('1');
    await dialog.getByRole('button', { name: 'Registrar devolución' }).click();
    await expect(toast(page, 'Devolución registrada')).toBeVisible();

    await expect(page.getByText('Devuelto 1 par de 4 pares')).toBeVisible();
    // Con devoluciones vigentes la entrega no se puede anular: primero se anulan las devoluciones.
    await expect(page.getByText(/anula primero sus devoluciones/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Anular Entrega/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Anular Devolución/ })).toBeVisible();
    // El stock vuelve (+1) y el libro cuadra.
    const { detail, stock, ledger } = await stockVsLedger(page, f.id);
    expect(detail.totalStock).toBe('7');
    for (const [location, quantity] of stock) expect(ledger.get(location) ?? 0).toBe(quantity);
    await eachTheme(page, () => expectNoA11yViolations(page));
    expect(await horizontalOverflow(page)).toBe(false);
  });

  test('permisos separados: quien solo ajusta no anula y quien solo anula no ajusta (P2)', async ({
    page,
    playwright,
  }) => {
    const f = await createFixture(page);
    await apiPost(page.request, `/api/v1/consumables/${f.id}/receipts`, {
      locationId: f.main.id,
      quantity: '5',
    });
    const suffix = uniqueName('rol');
    for (const [name, permissions] of [
      [`Solo ajusta ${suffix}`, ['consumables:read', 'consumables:adjust']],
      [`Solo anula ${suffix}`, ['consumables:read', 'consumables:reverse']],
    ] as const) {
      await apiPost(page.request, '/api/v1/roles', {
        name,
        description: 'Rol de prueba',
        permissions,
      });
    }
    const context = () =>
      playwright.request.newContext({
        baseURL: process.env['BASE_URL'] ?? 'http://localhost:8080',
      });
    const adjuster = await provisionUser(page.request, context, {
      role: `Solo ajusta ${suffix}`,
      prefix: 'ajusta',
    });
    const reverser = await provisionUser(page.request, context, {
      role: `Solo anula ${suffix}`,
      prefix: 'anula',
    });

    await page.context().clearCookies();
    await loginViaUi(page, adjuster.email, adjuster.password);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByRole('button', { name: 'Ajustar' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Anular/ })).toHaveCount(0);

    await page.context().clearCookies();
    await loginViaUi(page, reverser.email, reverser.password);
    await expect(page.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();
    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByRole('button', { name: /^Anular Ingreso/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ajustar' })).toHaveCount(0);
  });

  test('bodega inactiva con stock: salidas sí, entradas no, y avisa al desactivarla (P7)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const f = await createFixture(page);
    await apiPost(page.request, `/api/v1/consumables/${f.id}/receipts`, {
      locationId: f.main.id,
      quantity: '10',
    });
    // Al desactivarla desde Catálogo, la confirmación dice cuántos consumibles tienen stock en ella.
    await page.goto(`/catalogo/locations?q=${encodeURIComponent(f.main.name)}`);
    await visibleText(page, f.main.name).first().waitFor();
    await page
      .getByRole('button', { name: `Desactivar ${f.main.name}` })
      .locator('visible=true')
      .click();
    const confirm = page.getByRole('dialog', { name: 'Desactivar bodega con stock' });
    // D14: formato estructurado con el dato clave y lo que se bloquea.
    await expect(confirm).toContainText('Stock en esta bodega');
    await expect(confirm.locator('[data-highlight="true"]')).toHaveText('1 consumible');
    await expect(confirm).toContainText('No admite ingresos');
    await expect(confirm).toContainText('Sí permite sacar stock');
    await expectNoA11yViolations(page);
    await confirm.getByRole('button', { name: 'Desactivar' }).click();
    await expect(toast(page, 'Estado actualizado')).toBeVisible();

    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByText('Bodega inactiva').first()).toBeVisible();
    // Entrada: la bodega inactiva se ve apagada con el motivo, no falla al enviar.
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Bodega\*/ })
      .click();
    const blocked = page.getByRole('option', { name: new RegExp(escapeRegExp(f.main.name)) });
    await expect(blocked).toHaveAttribute('data-disabled', '');
    await expect(blocked).toContainText('Bodega inactiva: solo admite salidas');
    await expectNoA11yViolations(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');

    // Salida: se puede vaciar. La entrega elige sola la única bodega con stock.
    await page.getByRole('button', { name: 'Entregar' }).click();
    await expect(page.getByText('Máximo disponible en esta bodega: 10 pares')).toBeVisible();
    await page.getByLabel('Cantidad', { exact: false }).first().fill('10');
    await page.getByRole('combobox', { name: 'Quién recibe' }).click();
    await page.getByRole('option', { name: 'Otra persona (nombre escrito)' }).click();
    await page.getByLabel('Nombre de quien recibe').fill('Persona Inventada');
    await page.getByRole('button', { name: 'Registrar entrega' }).click();
    await expect(toast(page, 'Entrega registrada')).toBeVisible();
    // Vacía y sin stock: ya no queda nada que sacar de ninguna bodega.
    await expect(page.getByRole('button', { name: 'Entregar' })).toBeDisabled();
    const { stock, ledger } = await stockVsLedger(page, f.id);
    expect(stock.get(f.main.id)).toBe(0);
    for (const [location, quantity] of stock) expect(ledger.get(location) ?? 0).toBe(quantity);
  });

  test('fecha pasada: solo el ingreso, hasta 90 días atrás; una más antigua se rechaza y una válida se registra con «Registrado el…» (P6)', async ({
    page,
  }) => {
    const f = await createFixture(page);
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toLocaleDateString('en-CA');
    };
    await page.goto(`/consumibles/${f.id}`);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ingreso a bodega' });
    await pickWarehouse(page, f.main.name);
    await dialog.getByLabel('Cantidad', { exact: false }).first().fill('2');
    await expect(dialog.getByLabel('Fecha del ingreso')).toHaveAttribute('max', daysAgo(0));
    await expect(dialog.getByLabel('Fecha del ingreso')).toHaveAttribute('min', daysAgo(90));
    await dialog.getByLabel('Fecha del ingreso').fill(daysAgo(100));
    await dialog.getByRole('button', { name: 'Registrar ingreso' }).click();
    await expect(dialog.getByText('más de 90 días atrás')).toBeVisible();
    // La API lo rechaza igual si se evita el formulario.
    const csrf = (await (await page.request.get('/api/v1/auth/csrf')).json()) as { token: string };
    const direct = await page.request.post(`/api/v1/consumables/${f.id}/receipts`, {
      data: { locationId: f.main.id, quantity: '1', receivedOn: daysAgo(100) },
      headers: { 'x-csrf-token': csrf.token },
    });
    expect(direct.status()).toBe(422);

    await dialog.getByLabel('Fecha del ingreso').fill(daysAgo(5));
    await dialog.getByRole('button', { name: 'Registrar ingreso' }).click();
    await expect(toast(page, 'Ingreso registrado')).toBeVisible();
    // Fecha sola (sin la hora inventada) y una línea con cuándo se registró y quién.
    await expect(page.getByText(/Registrado el \d{2}-\d{2}-\d{4} \d{2}:\d{2} por /)).toBeVisible();
    await expect(
      page.getByText(
        new Date(daysAgo(5) + 'T12:00:00')
          .toLocaleDateString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
          .replaceAll('/', '-'),
        { exact: true },
      ),
    ).toBeVisible();
  });

  test('los mínimos de una bodega inactiva no avisan: se ven atenuados con la nota «bodega inactiva» (D16)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const f = await createFixture(page);
    // Mínimo de 5 en la bodega central y solo 2 en ella: avisa mientras la bodega esté activa.
    await apiPatch(page.request, `/api/v1/consumables/${f.id}`, {
      minStock: null,
      warehouseMinimums: [{ locationId: f.main.id, minQuantity: '5' }],
    });
    await apiPost(page.request, `/api/v1/consumables/${f.id}/receipts`, {
      locationId: f.main.id,
      quantity: '2',
    });
    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByTestId('below-warehouse')).toHaveCount(1);

    await apiPatch(page.request, `/api/v1/locations/${f.main.id}`, { active: false });

    await page.goto(`/consumibles/${f.id}`);
    await expect(page.getByTestId('below-warehouse')).toHaveCount(0);
    const minimum = page.getByTestId('inactive-minimum').locator('visible=true');
    await expect(minimum).toContainText('5 pares');
    await expect(minimum).toContainText('bodega inactiva');
    await expect(page.getByText(/bajo mínimo/i)).toHaveCount(0);
    await expectNoA11yViolations(page);

    // Ni el listado con «Bajo mínimo» ni el aviso de Inicio lo cuentan.
    const low = (await (
      await page.request.get('/api/v1/consumables?lowStock=true&pageSize=100')
    ).json()) as {
      data: { id: string }[];
    };
    expect(low.data.map((c) => c.id)).not.toContain(f.id);
  });

  test('el traslado es una sola entrada, «Ir al movimiento» resalta y los botones de la ficha son del mismo tamaño (P8, P14, P16)', async ({
    page,
  }, testInfo) => {
    const f = await createFixture(page);
    await apiPost(page.request, `/api/v1/consumables/${f.id}/receipts`, {
      locationId: f.main.id,
      quantity: '10',
    });
    const transfer = await apiPost<{ movements: { id: string }[] }>(
      page.request,
      `/api/v1/consumables/${f.id}/transfers`,
      { fromLocationId: f.main.id, toLocationId: f.annex.id, quantity: '4' },
    );
    await apiPost(
      page.request,
      `/api/v1/consumable-movements/${transfer.movements[1]!.id}/reversals`,
      {
        reason: 'Bodega equivocada',
      },
    );
    await page.goto(`/consumibles/${f.id}`);
    // Una entrada por el traslado y otra por su anulación, no cuatro (D15: título corto y la ruta en otra línea).
    await expect(page.getByText('Traslado 4 pares', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Anulación de traslado 4 pares', { exact: true })).toHaveCount(1);
    await expect(
      page.getByTestId('transfer-route').filter({ hasText: `${f.main.name} → ${f.annex.name}` }),
    ).toHaveCount(1);
    await expect(
      page.getByTestId('transfer-route').filter({ hasText: `${f.annex.name} → ${f.main.name}` }),
    ).toHaveCount(1);

    // «Ir al movimiento» marca el movimiento con el color primario.
    await page.getByRole('link', { name: 'Ir al movimiento' }).first().click();
    const target = page
      .locator('li[id^="mov-"]')
      .filter({ hasText: 'Traslado 4 pares' })
      .filter({ hasNotText: 'Anulación' });
    await expect(target.first()).toHaveClass(/border-primary/);
    await eachTheme(page, async () => {
      await page.getByRole('link', { name: 'Ir al movimiento' }).first().click();
      await expectNoA11yViolations(page);
    });

    // Botones de acción: mismo ancho en la grilla de dos columnas a 360 px.
    if ((page.viewportSize()?.width ?? 1280) < 640) {
      const group = page.getByRole('group', { name: 'Consumibles' });
      const boxes = await group.getByRole('button').evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        }),
      );
      expect(boxes.length).toBeGreaterThanOrEqual(4);
      expect(new Set(boxes.map((b) => b.w)).size).toBe(1);
      expect(new Set(boxes.map((b) => b.h)).size).toBe(1);
      expect(await horizontalOverflow(page)).toBe(false);
      testInfo.annotations.push({ type: 'p16', description: JSON.stringify(boxes[0]) });
    }
  });

  test('Inicio: «Últimos movimientos» incluye los de consumibles (P10)', async ({ page }) => {
    const f = await createFixture(page);
    await apiPost(page.request, `/api/v1/consumables/${f.id}/receipts`, {
      locationId: f.main.id,
      quantity: '3',
    });
    await page.goto('/');
    const recent = page.locator('#recent-title + ol');
    await expect(recent.getByText(f.name).first()).toBeVisible();
    await expect(recent.getByText('Ingreso +3 pares').first()).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test('desactivar pide confirmación con ícono de encendido (P18) y el catálogo habla de consumibles (P17)', async ({
    page,
  }) => {
    await page.goto('/catalogo/consumableCategories');
    await expect(
      page.getByText(/categorías de consumibles y unidades de medida/i).first(),
    ).toBeVisible();
    const name = uniqueName('EPP temporal');
    await apiPost(page.request, '/api/v1/categories', { name, scope: 'consumable' });
    await page.goto(`/catalogo/consumableCategories?q=${encodeURIComponent(name)}`);
    await visibleText(page, name).first().waitFor();
    const toggle = page.getByRole('button', { name: `Desactivar ${name}` }).locator('visible=true');
    await toggle.click();
    const confirm = page.getByRole('dialog', { name: /^Desactivar/ });
    await expect(confirm).toContainText(`¿Desactivar «${name}»?`);
    await confirm.getByRole('button', { name: 'Cancelar' }).click();
    await expect(
      page.getByRole('button', { name: `Desactivar ${name}` }).locator('visible=true'),
    ).toBeVisible();
    await toggle.click();
    await confirm.getByRole('button', { name: 'Desactivar' }).click();
    await expect(toast(page, 'Estado actualizado')).toBeVisible();
    await expect(
      page.getByRole('button', { name: `Activar ${name}` }).locator('visible=true'),
    ).toBeVisible();
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
