import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  ADMIN,
  apiDelete,
  apiPost,
  createAssetViaApi,
  eachTheme,
  expectNoA11yViolations,
  horizontalOverflow,
  loginViaApi,
  statusIdByName,
  uniqueName,
} from './support';

/** Ids y API key del ChirpStack de prueba que deja `chirpstack-bootstrap` (ver compose.e2e.yml). */
const chirpstack = JSON.parse(readFileSync(process.env['CHIRPSTACK_CONFIG'] ?? '', 'utf8')) as {
  endpoint: string;
  tenantId: string;
  applicationId: string;
  deviceProfileId: string;
  apiKey: string;
  /** Dispositivos creados por el bootstrap sin la etiqueta de Inventarius, para probar «vincular» (uno por proyecto). */
  foreignDevices: { devEui: string; joinEui: string; appKey: string }[];
};

// Datos inventados: DevEUI y claves aleatorios por corrida, nunca valores reales.
const hex = (bytes: number) => randomBytes(bytes).toString('hex').toUpperCase();
// Prefijo propio de esta corrida (2 bytes aleatorios): lo creado aquí se distingue de lo de otras corridas y de lo manual.
const RUN = hex(2);
const newDevEui = () => `70B3D5${RUN}${hex(3)}`;

/** Activos de esta corrida que pueden haber quedado registrados en ChirpStack: `afterAll` los da de baja. */
const touched: string[] = [];

// Esta suite crea y borra dispositivos en ChirpStack: se niega a correr si el endpoint no está marcado como de prueba.
test.beforeAll(() => {
  if (process.env['CHIRPSTACK_TEST_ENDPOINT'] !== chirpstack.endpoint) {
    throw new Error(
      `El e2e de LoRaWAN se niega a correr contra «${chirpstack.endpoint}»: defina CHIRPSTACK_TEST_ENDPOINT ` +
        'con ese mismo endpoint para marcarlo como ChirpStack de prueba',
    );
  }
});

// Cada prueba deja limpio lo que creó en ChirpStack: se da de baja por la propia API, con el worker real.
test.afterAll(async ({ playwright }) => {
  const api = await playwright.request.newContext({ baseURL: process.env['BASE_URL'] ?? '' });
  try {
    await loginViaApi(api, ADMIN.email, ADMIN.password);
    for (const id of touched) await deregisterQuietly(api, id);
  } finally {
    await api.dispose();
  }
});

async function deregisterQuietly(api: APIRequestContext, assetId: string): Promise<void> {
  const registration = async () =>
    (
      (await (await api.get(`/api/v1/assets/${assetId}/lorawan`)).json()) as {
        registration: { status: string } | null;
      }
    ).registration;
  const settle = async (): Promise<{ status: string } | null> => {
    let reg = await registration();
    for (
      let i = 0;
      i < 40 && reg && ['registering', 'deregistering'].includes(reg.status);
      i += 1
    ) {
      await new Promise((ok) => setTimeout(ok, 1_000));
      reg = await registration();
    }
    return reg;
  };
  try {
    const reg = await settle();
    if (!reg) return;
    if (reg.status === 'conflict') {
      await apiPost(api, `/api/v1/assets/${assetId}/lns-registration/resolve`, {
        action: 'cancel',
      });
    } else if (['registered', 'partial', 'error'].includes(reg.status)) {
      await apiDelete(api, `/api/v1/assets/${assetId}/lns-registration`);
      await settle();
    }
  } catch (e) {
    throw new Error(`No se pudo limpiar ${assetId} en ChirpStack`, { cause: e });
  }
}

test.beforeEach(async ({ page }) => {
  await loginViaApi(page.request, ADMIN.email, ADMIN.password);
});

const toast = (page: Page, text: string | RegExp) =>
  page
    .getByLabel(/^Notificaciones/)
    .getByText(text)
    .first();

/** Perfil LNS apuntando al ChirpStack de prueba. */
async function createProfile(page: Page): Promise<{ id: string; name: string }> {
  const name = uniqueName('ChirpStack e2e');
  const profile = await apiPost<{ id: string }>(page.request, '/api/v1/lns-profiles', {
    kind: 'chirpstack',
    name,
    endpoint: chirpstack.endpoint,
    credential: chirpstack.apiKey,
    target: { tenantId: chirpstack.tenantId, applicationId: chirpstack.applicationId },
    deviceDefaults: { deviceProfileId: chirpstack.deviceProfileId },
  });
  return { id: profile.id, name };
}

/** Modelo y activo LoRaWAN con todos los datos listos para registrar. */
async function createLorawanAsset(page: Page, over: { devEui?: string } = {}) {
  const manufacturer = await apiPost<{ id: string }>(page.request, '/api/v1/manufacturers', {
    name: uniqueName('Fabricante LW'),
  });
  const category = await apiPost<{ id: string }>(page.request, '/api/v1/categories', {
    name: uniqueName('Sensores LW'),
    extension: 'lorawan',
  });
  const model = await apiPost<{ id: string }>(page.request, '/api/v1/models', {
    name: uniqueName('Sensor'),
    manufacturerId: manufacturer.id,
    categoryId: category.id,
    lorawanClass: 'A',
    lorawanVersion: '1.0.3',
    lorawanRegion: 'AU915',
  });
  const location = await apiPost<{ id: string }>(page.request, '/api/v1/locations', {
    name: uniqueName('Bodega LW'),
    type: 'warehouse',
  });
  const devEui = over.devEui ?? newDevEui();
  const appKey = hex(16);
  const asset = await createAssetViaApi(
    page.request,
    {
      manufacturerId: manufacturer.id,
      categoryId: category.id,
      modelId: model.id,
      modelName: '',
      locationId: location.id,
      locationName: '',
    },
    { lorawan: { devEui, joinEui: hex(8), appKey } },
  );
  touched.push(asset.id);
  return { ...asset, devEui, appKey, statusId: await statusIdByName(page.request, 'Disponible') };
}

test.describe('LoRaWAN (RF-21, RF-50 a RF-66) contra un ChirpStack v4 real', () => {
  test('registrar y dar de baja desde la ficha, con el worker y la cola reales', async ({
    page,
  }) => {
    const profile = await createProfile(page);
    const asset = await createLorawanAsset(page);

    await page.goto(`/activos/${asset.id}`);
    const section = page.getByTestId('lorawan-section');
    await expect(section.getByText(asset.devEui)).toBeVisible();
    await expect(section.getByText('No registrado')).toBeVisible();
    // Las claves nunca aparecen en la ficha.
    await expect(page.locator('body')).not.toContainText(asset.appKey);
    expect(await horizontalOverflow(page)).toBe(false);
    await eachTheme(page, () => expectNoA11yViolations(page));

    // Registrar: perfil -> vista previa sin claves -> confirmar.
    await section.getByRole('button', { name: 'Registrar en LNS' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#reg-profile').click();
    await page.getByRole('option', { name: new RegExp(profile.name) }).click();
    await expect(
      dialog.getByRole('heading', { name: 'Se enviará exactamente esto' }),
    ).toBeVisible();
    // La confirmación muestra la AppKey enmascarada, el device profile con su versión y región, y los tags (P9).
    await expect(dialog).toContainText('Device profile (en el LNS)');
    await expect(dialog).toContainText('AU915');
    await expect(dialog).toContainText('inventarius_asset_id');
    const mask = dialog.getByText('•••• (32 hex)', { exact: true });
    await expect(mask).toBeVisible();
    // La máscara cabe en una sola línea, también a 360 px.
    const box = await mask.boundingBox();
    const lineHeight = await mask.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect(box!.height).toBeLessThan(lineHeight * 1.5);
    await expect(dialog.getByText(asset.devEui.toLowerCase(), { exact: true })).toBeVisible();
    await expect(dialog).not.toContainText(asset.appKey);
    expect(await horizontalOverflow(page)).toBe(false);
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Confirmar y registrar' }).click();

    // El worker registra en ChirpStack y la ficha se actualiza sola.
    await expect(section.getByText('Registrado', { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(section.getByText(asset.devEui.toLowerCase(), { exact: true })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Dar de baja en LNS' })).toBeVisible();
    // Mientras está registrado, el listado lo muestra y se filtra por estado LNS.
    await page.goto(`/activos?q=${asset.devEui}`);
    await expect(
      page.getByText('Registrado', { exact: true }).locator('visible=true'),
    ).toBeVisible();

    // Dar de baja: el dispositivo se borra de ChirpStack y el activo vuelve a «no registrado».
    await page.goto(`/activos/${asset.id}`);
    await section.getByRole('button', { name: 'Dar de baja en LNS' }).click();
    await page
      .getByRole('alertdialog')
      .or(page.getByRole('dialog'))
      .getByRole('button', { name: 'Dar de baja en LNS' })
      .click();
    await expect(section.getByText('No registrado')).toBeVisible({ timeout: 45_000 });
    await expect(section.getByRole('button', { name: 'Registrar en LNS' })).toBeVisible();
  });

  test('vincular un dispositivo que ya existe en ChirpStack: lee, muestra diferencias, adopta y desvincula', async ({
    page,
  }, info) => {
    const foreign = chirpstack.foreignDevices[info.project.name === 'mobile' ? 1 : 0]!;
    const profile = await createProfile(page);
    const asset = await createLorawanAsset(page, { devEui: foreign.devEui });

    // Registrar: el DevEUI ya existe en ChirpStack y no lo creó Inventarius -> conflicto, sin tocarlo.
    await apiPost(page.request, `/api/v1/assets/${asset.id}/lns-registration`, {
      profileId: profile.id,
    });
    await page.goto(`/activos/${asset.id}`);
    const section = page.getByTestId('lorawan-section');
    await expect(section.getByText('Conflicto', { exact: true })).toBeVisible({ timeout: 45_000 });
    // El mensaje del conflicto sale una sola vez (P5).
    await expect(section.getByText(/ya hay un dispositivo con ese DevEUI/i)).toHaveCount(1);
    await expect(section.getByText('Último error')).toHaveCount(0);

    // Vincular: se lee el dispositivo remoto y se muestran las diferencias antes de confirmar (P6).
    await section.getByRole('button', { name: 'Vincular', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Lo que tiene el LNS')).toBeVisible();
    await expect(dialog.getByText(foreign.joinEui).first()).toBeVisible();
    await expect(dialog.getByTestId('link-differences')).toContainText('JoinEUI: el activo tiene');
    await expect(dialog.getByTestId('link-differences')).toContainText(
      'AppKey: es distinta en el LNS y en el activo',
    );
    // El dispositivo ajeno sí tiene su AppKey: no hay aviso de join imposible (R6).
    await expect(dialog).not.toContainText('no podrá hacer join');
    // El device profile se muestra con nombre, versión y región, no como UUID (R5).
    await expect(dialog).toContainText('Inventarius pruebas · LoRaWAN 1.0.3 · AU915');
    await expect(dialog).not.toContainText(chirpstack.deviceProfileId);
    // Nunca se muestra el valor de una clave, ni la del LNS ni la del activo.
    await expect(dialog).not.toContainText(foreign.appKey);
    await expect(dialog).not.toContainText(asset.appKey);
    expect(await horizontalOverflow(page)).toBe(false);
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Adoptar los datos del LNS y vincular' }).click();

    // Vinculado: la ficha muestra lo que de verdad tiene el LNS y el activo adoptó su JoinEUI.
    await expect(section.getByText('Vinculado (ya existía en el LNS)')).toBeVisible();
    const remote = section.getByTestId('lorawan-remote');
    await expect(remote).toContainText(foreign.joinEui);
    await expect(remote).toContainText('Inventarius pruebas · LoRaWAN 1.0.3 · AU915');
    await expect(remote).toContainText('AppKey');
    await expect(remote).toContainText('cargada en el LNS');
    await expect(section.getByText(foreign.joinEui).first()).toBeVisible();

    // Desvincular (P7): sin estilo destructivo y sin borrar nada en ChirpStack.
    const unlink = section.getByRole('button', { name: 'Desvincular' });
    await expect(unlink).toBeVisible();
    await expect(section.getByRole('button', { name: 'Dar de baja en LNS' })).toHaveCount(0);
    await unlink.click();
    await page
      .getByRole('alertdialog')
      .or(page.getByRole('dialog'))
      .getByRole('button', { name: 'Desvincular' })
      .click();
    await expect(section.getByText('No registrado')).toBeVisible({ timeout: 45_000 });

    // El dispositivo ajeno sigue en ChirpStack: registrar otra vez vuelve a dar conflicto, no un registro nuevo.
    await apiPost(page.request, `/api/v1/assets/${asset.id}/lns-registration`, {
      profileId: profile.id,
    });
    await page.reload();
    await expect(section.getByText('Conflicto', { exact: true })).toBeVisible({ timeout: 45_000 });
    // Se libera el DevEUI para que la prueba se pueda repetir en el mismo ChirpStack.
    const token = (
      (await (await page.request.get('/api/v1/auth/csrf')).json()) as { token: string }
    ).token;
    const headers = { 'x-csrf-token': token };
    await page.request.post(`/api/v1/assets/${asset.id}/lns-registration/resolve`, {
      data: { action: 'cancel' },
      headers,
    });
    await page.request.patch(`/api/v1/assets/${asset.id}/lorawan`, {
      data: { devEui: newDevEui() },
      headers,
    });
  });

  test('un activo ya registrado rechaza otro registro (409) y se da de baja por API', async ({
    page,
  }) => {
    const profile = await createProfile(page);
    const asset = await createLorawanAsset(page);
    await apiPost(page.request, `/api/v1/assets/${asset.id}/lns-registration`, {
      profileId: profile.id,
    });
    await page.goto(`/activos/${asset.id}`);
    const section = page.getByTestId('lorawan-section');
    await expect(section.getByText('Registrado', { exact: true })).toBeVisible({ timeout: 45_000 });
    const token = (
      (await (await page.request.get('/api/v1/auth/csrf')).json()) as { token: string }
    ).token;
    const again = await page.request.post(`/api/v1/assets/${asset.id}/lns-registration`, {
      data: { profileId: profile.id },
      headers: { 'x-csrf-token': token },
    });
    expect(again.status()).toBe(409);
    // No se puede dar de baja el activo mientras esté en el LNS (RF-25).
    const del = await page.request.delete(`/api/v1/assets/${asset.id}`, {
      data: { reason: 'prueba e2e' },
      headers: { 'x-csrf-token': token },
    });
    expect(del.status()).toBe(409);
    await section.getByRole('button', { name: 'Dar de baja en LNS' }).click();
    await page
      .getByRole('alertdialog')
      .or(page.getByRole('dialog'))
      .getByRole('button', { name: 'Dar de baja en LNS' })
      .click();
    await expect(section.getByText('No registrado')).toBeVisible({ timeout: 45_000 });
  });

  test('perfiles LNS: Probar conexión contra ChirpStack y credencial enmascarada', async ({
    page,
  }) => {
    const profile = await createProfile(page);
    await page.goto('/perfiles-lns');
    await expect(page.getByRole('heading', { name: 'Perfiles LNS' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(chirpstack.apiKey);
    expect(await horizontalOverflow(page)).toBe(false);
    await page
      .getByRole('button', { name: `Probar conexión ${profile.name}` })
      .locator('visible=true')
      .click();
    await expect(page.getByRole('status').filter({ hasText: /Conexión correcta/ })).toBeVisible({
      timeout: 20_000,
    });
    await eachTheme(page, () => expectNoA11yViolations(page));
  });

  test('perfiles LNS: crear por la interfaz y editar sin ver la credencial', async ({ page }) => {
    const name = uniqueName('Perfil UI');
    await page.goto('/perfiles-lns');
    await page.getByRole('button', { name: 'Nuevo perfil' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('#lns-name').fill(name);
    await dialog.locator('#lns-endpoint').fill(chirpstack.endpoint);
    await dialog.locator('#lns-credential').fill(chirpstack.apiKey);
    await dialog.locator('#lns-tenantId').fill(chirpstack.tenantId);
    await dialog.locator('#lns-applicationId').fill(chirpstack.applicationId);
    await dialog.locator('#lns-deviceProfileId').fill(chirpstack.deviceProfileId);
    expect(await horizontalOverflow(page)).toBe(false);
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Perfil creado')).toBeVisible();
    await expect(page.getByText(name).locator('visible=true').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(chirpstack.apiKey);
  });

  test('importar un CSV: vista previa con errores por fila y aplicación todo o nada', async ({
    page,
  }) => {
    const a = await createLorawanAsset(page);
    const b = await createLorawanAsset(page);
    const row = (serial: string, eui: string) => `${serial},${eui},${hex(8)},${hex(16)}`;
    const bad = [
      'serial,DevEUI,JoinEUI,AppKey',
      row(a.serial, newDevEui()),
      row('NO-EXISTE', newDevEui()),
    ].join('\n');
    await page.goto('/activos/importar-lorawan');
    await page
      .locator('#lw-import-file')
      .setInputFiles({ name: 'lorawan.csv', mimeType: 'text/csv', buffer: Buffer.from(bad) });
    await expect(page.getByRole('status')).toContainText('2 filas: 1 válidas, 1 con errores');
    await expect(page.getByText('Ningún activo tiene ese número de serie')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Importar/ })).toBeDisabled();
    expect(await horizontalOverflow(page)).toBe(false);
    await expectNoA11yViolations(page);

    const euiA = newDevEui();
    const euiB = newDevEui();
    const good = ['serial,DevEUI,JoinEUI,AppKey', row(a.serial, euiA), row(b.serial, euiB)].join(
      '\n',
    );
    await page
      .locator('#lw-import-file')
      .setInputFiles({ name: 'lorawan.csv', mimeType: 'text/csv', buffer: Buffer.from(good) });
    await expect(page.getByRole('status')).toContainText('2 filas: 2 válidas, 0 con errores');
    await page.getByRole('button', { name: 'Importar 2 dispositivos' }).click();
    await expect(page).toHaveURL(/\/activos$/);
    await page.goto(`/activos/${a.id}`);
    await expect(page.getByTestId('lorawan-section').getByText(euiA)).toBeVisible();
  });

  test('revelar claves: confirmación, clave visible solo en el diálogo y registrada en auditoría', async ({
    page,
  }) => {
    const asset = await createLorawanAsset(page);
    await page.goto(`/activos/${asset.id}`);
    await page.getByRole('button', { name: 'Mostrar claves' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('queda registrado en la auditoría');
    await expect(dialog).not.toContainText(asset.appKey);
    expect(await horizontalOverflow(page)).toBe(false);
    await dialog.getByRole('button', { name: 'Mostrar', exact: true }).click();
    await expect(dialog.getByTestId('revealed-key')).toHaveText(asset.appKey);
    await expectNoA11yViolations(page);
    await dialog.getByRole('button', { name: 'Ocultar' }).click();
    await expect(page.locator('body')).not.toContainText(asset.appKey);
    await page.goto(`/auditoria`);
    await expect(page.getByText('Revelado de claves LoRaWAN').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(asset.appKey);
  });

  test('editar datos LoRaWAN desde la ficha en 360 px sin desbordar', async ({ page }) => {
    const asset = await createLorawanAsset(page);
    await page.goto(`/activos/${asset.id}`);
    await page.getByRole('button', { name: 'Editar datos LoRaWAN' }).click();
    const eui = newDevEui();
    await page.locator('#lw-deveui').fill(eui);
    expect(await horizontalOverflow(page)).toBe(false);
    await expectNoA11yViolations(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(toast(page, 'Datos LoRaWAN guardados')).toBeVisible();
    await expect(page.getByTestId('lorawan-section').getByText(eui)).toBeVisible();
  });
});
