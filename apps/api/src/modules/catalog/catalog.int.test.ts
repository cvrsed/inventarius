import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from '../../../test/app.js';

let env: TestEnv;
let admin: TestClient;
let operator: TestClient;
let reader: TestClient;

beforeAll(async () => {
  env = await createTestEnv();
  await env.createUser({ email: 'admin@ejemplo.cl', role: 'Administrador' });
  await env.createUser({ email: 'op@ejemplo.cl', role: 'Operador' });
  await env.createUser({ email: 'lector@ejemplo.cl', role: 'Lector' });
  admin = env.client('10.1.0.1');
  operator = env.client('10.1.0.2');
  reader = env.client('10.1.0.3');
  await admin.login('admin@ejemplo.cl');
  await operator.login('op@ejemplo.cl');
  await reader.login('lector@ejemplo.cl');
});
afterAll(async () => env.close());

const etag = (res: { headers: Record<string, unknown> }) => String(res.headers['etag']);
const base = '/api/v1';

async function create<T = Record<string, unknown>>(
  client: TestClient,
  path: string,
  body: unknown,
) {
  const res = await client.post(`${base}/${path}`, body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as T & { id: string; updatedAt: string };
}

describe.each([
  ['categories', { name: 'Sensores' }, { name: 'Sensores 2' }],
  ['manufacturers', { name: 'Milesight' }, { name: 'Milesight Inc' }],
] as const)('CRUD de %s (RF-10, RF-11)', (path, body, patch) => {
  it('Operador crea, Lector solo lee', async () => {
    const created = await create(operator, path, body);
    expect(created).toMatchObject({ ...body, active: true });
    expect((await reader.post(`${base}/${path}`, { name: 'x' })).statusCode).toBe(403);
    expect((await reader.get(`${base}/${path}/${created.id}`)).statusCode).toBe(200);
  });

  it('rechaza nombres duplicados sin distinguir mayúsculas (409)', async () => {
    const res = await operator.post(`${base}/${path}`, { name: body.name.toUpperCase() });
    expect(res.statusCode).toBe(409);
  });

  it('lista con búsqueda, orden y paginación del lado servidor', async () => {
    for (const n of ['Zeta', 'Alfa', 'Beta']) await create(operator, path, { name: `${n} lista` });
    const page = await reader.get(`${base}/${path}?q=lista&sort=name&pageSize=2&page=1`);
    expect(page.json().meta).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(page.json().data.map((x: { name: string }) => x.name)).toEqual([
      'Alfa lista',
      'Beta lista',
    ]);
    const desc = await reader.get(`${base}/${path}?q=lista&sort=-name&pageSize=1`);
    expect(desc.json().data[0].name).toBe('Zeta lista');
  });

  it('PATCH exige If-Match (428) y detecta cambios ajenos (412)', async () => {
    const created = await create(operator, path, { name: `${path} para editar` });
    expect((await operator.patch(`${base}/${path}/${created.id}`, patch)).statusCode).toBe(428);
    const ok = await operator.patch(`${base}/${path}/${created.id}`, patch, {
      'if-match': etag(await reader.get(`${base}/${path}/${created.id}`)),
    });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().name).toBe(patch.name);
    const stale = await operator.patch(`${base}/${path}/${created.id}`, patch, {
      'if-match': `"${created.updatedAt}"`,
    });
    expect(stale.statusCode).toBe(412);
  });

  it('borra lo que no está en uso y deja rastro en auditoría (RF-14, RF-30)', async () => {
    const created = await create(operator, path, { name: `${path} efímero` });
    expect((await operator.delete(`${base}/${path}/${created.id}`)).statusCode).toBe(204);
    expect((await reader.get(`${base}/${path}/${created.id}`)).statusCode).toBe(404);
    const audit = await admin.get(
      `${base}/audit?entity=${path === 'categories' ? 'category' : 'manufacturer'}&pageSize=100`,
    );
    const actions = audit.json().data.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\.create$/),
        expect.stringMatching(/\.delete$/),
      ]),
    );
  });

  it('el filtro active separa activos de inactivos', async () => {
    const created = await create(operator, path, { name: `${path} inactivo` });
    await operator.patch(
      `${base}/${path}/${created.id}`,
      { active: false },
      { 'if-match': `"${created.updatedAt}"` },
    );
    const actives = await reader.get(`${base}/${path}?active=true&q=inactivo`);
    expect(actives.json().meta.total).toBe(0);
    const inactives = await reader.get(`${base}/${path}?active=false&q=inactivo`);
    expect(inactives.json().meta.total).toBe(1);
  });
});

describe('modelos (RF-11)', () => {
  let manufacturerId: string;
  let plainCategoryId: string;
  let loraCategoryId: string;

  beforeAll(async () => {
    manufacturerId = (await create(operator, 'manufacturers', { name: 'Fabricante de modelos' }))
      .id;
    plainCategoryId = (await create(operator, 'categories', { name: 'Notebooks' })).id;
    loraCategoryId = (
      await create(operator, 'categories', { name: 'Medidores LoRa', extension: 'lorawan' })
    ).id;
  });

  it('crea un modelo y expone fabricante y categoría como referencias', async () => {
    const model = await create(operator, 'models', {
      name: 'ThinkPad',
      modelNumber: 'T14',
      manufacturerId,
      categoryId: plainCategoryId,
    });
    expect(model).toMatchObject({
      name: 'ThinkPad',
      modelNumber: 'T14',
      manufacturer: { id: manufacturerId },
      category: { id: plainCategoryId, extension: 'none' },
      lorawanClass: null,
    });
  });

  it('los defaults LoRaWAN solo valen en categorías lorawan (422)', async () => {
    const bad = await operator.post(`${base}/models`, {
      name: 'Raro',
      manufacturerId,
      categoryId: plainCategoryId,
      lorawanClass: 'A',
    });
    expect(bad.statusCode).toBe(422);
    const ok = await create(operator, 'models', {
      name: 'SDM530',
      manufacturerId,
      categoryId: loraCategoryId,
      lorawanClass: 'C',
      lorawanVersion: '1.0.3',
      lorawanRegionalParameters: 'RP002-1.0.3',
    });
    expect(ok).toMatchObject({ lorawanClass: 'C', lorawanVersion: '1.0.3' });
  });

  it('cambiar a una categoría sin extensión borra los defaults LoRaWAN', async () => {
    const m = await create(operator, 'models', {
      name: 'Medidor',
      manufacturerId,
      categoryId: loraCategoryId,
      lorawanClass: 'A',
    });
    const res = await operator.patch(
      `${base}/models/${m.id}`,
      { categoryId: plainCategoryId },
      { 'if-match': `"${m.updatedAt}"` },
    );
    expect(res.json()).toMatchObject({ lorawanClass: null, lorawanVersion: null });
  });

  it('no repite nombre dentro del mismo fabricante (409) y filtra por categoría', async () => {
    const dup = await operator.post(`${base}/models`, {
      name: 'ThinkPad',
      manufacturerId,
      categoryId: plainCategoryId,
    });
    expect(dup.statusCode).toBe(409);
    const list = await reader.get(`${base}/models?categoryId=${loraCategoryId}`);
    expect(
      list.json().data.every((m: { category: { id: string } }) => m.category.id === loraCategoryId),
    ).toBe(true);
  });

  it('rechaza fabricantes o categorías inexistentes o inactivos (422)', async () => {
    const ghost = await operator.post(`${base}/models`, {
      name: 'Fantasma',
      manufacturerId: '018f0000-0000-7000-8000-00000000dead',
      categoryId: plainCategoryId,
    });
    expect(ghost.statusCode).toBe(422);
    const inactive = await create(operator, 'manufacturers', { name: 'Cerrado' });
    await operator.patch(
      `${base}/manufacturers/${inactive.id}`,
      { active: false },
      { 'if-match': `"${inactive.updatedAt}"` },
    );
    const res = await operator.post(`${base}/models`, {
      name: 'X',
      manufacturerId: inactive.id,
      categoryId: plainCategoryId,
    });
    expect(res.statusCode).toBe(422);
  });

  it('no se borra un fabricante ni una categoría en uso, pero se desactivan (RF-14)', async () => {
    const delM = await operator.delete(`${base}/manufacturers/${manufacturerId}`);
    expect(delM.statusCode).toBe(409);
    expect(delM.json().detail).toMatch(/desact/i);
    expect((await operator.delete(`${base}/categories/${plainCategoryId}`)).statusCode).toBe(409);
  });

  it('con withUsage=true el listado dice qué registros están en uso; sin él no calcula nada', async () => {
    const free = await create(operator, 'manufacturers', { name: 'Fabricante sin modelos' });
    const withUsage = await reader.get(`${base}/manufacturers?withUsage=true&pageSize=100`);
    const byId = new Map(
      (withUsage.json().data as { id: string; inUse?: boolean }[]).map((m) => [m.id, m.inUse]),
    );
    expect(byId.get(manufacturerId)).toBe(true);
    expect(byId.get(free.id)).toBe(false);
    const plain = await reader.get(`${base}/manufacturers?pageSize=100`);
    expect(plain.json().data[0]).not.toHaveProperty('inUse');
  });
});

describe('ubicaciones jerárquicas (RF-12)', () => {
  it('arma la ruta completa y filtra por texto', async () => {
    const cliente = await create(operator, 'locations', { name: 'Cliente A' });
    const edificio = await create(operator, 'locations', {
      name: 'Edificio 1',
      parentId: cliente.id,
      address: 'Calle 123',
    });
    const piso = await create<{ path: string; parent: { id: string } }>(operator, 'locations', {
      name: 'Piso 2',
      parentId: edificio.id,
    });
    expect(piso.path).toBe('Cliente A > Edificio 1 > Piso 2');
    expect(piso.parent.id).toBe(edificio.id);
    const found = await reader.get(`${base}/locations?q=Edificio`);
    expect(found.json().data[0]).toMatchObject({
      path: 'Cliente A > Edificio 1',
      address: 'Calle 123',
    });
  });

  it('impide ciclos: un padre no puede ser la propia ubicación ni un descendiente (422)', async () => {
    const a = await create(operator, 'locations', { name: 'Ciclo A' });
    const b = await create(operator, 'locations', { name: 'Ciclo B', parentId: a.id });
    const self = await operator.patch(
      `${base}/locations/${a.id}`,
      { parentId: a.id },
      { 'if-match': `"${a.updatedAt}"` },
    );
    expect(self.statusCode).toBe(422);
    const loop = await operator.patch(
      `${base}/locations/${a.id}`,
      { parentId: b.id },
      { 'if-match': `"${a.updatedAt}"` },
    );
    expect(loop.statusCode).toBe(422);
  });

  it('no se borra una ubicación con hijos (409) y el padre inexistente es 422', async () => {
    const parent = await create(operator, 'locations', { name: 'Padre' });
    await create(operator, 'locations', { name: 'Hijo', parentId: parent.id });
    expect((await operator.delete(`${base}/locations/${parent.id}`)).statusCode).toBe(409);
    const ghost = await operator.post(`${base}/locations`, {
      name: 'Huérfano',
      parentId: '018f0000-0000-7000-8000-00000000dead',
    });
    expect(ghost.statusCode).toBe(422);
  });
});

describe('estados (RF-13)', () => {
  it('viene sembrado con los cinco estados, uno de ellos del sistema', async () => {
    const res = await reader.get(`${base}/status-labels?pageSize=100&sort=name`);
    const names = res.json().data.map((s: { name: string }) => s.name);
    expect(names).toEqual(
      expect.arrayContaining(['Disponible', 'Asignado', 'En reparación', 'Dañado', 'Dado de baja']),
    );
    const assigned = res.json().data.find((s: { name: string }) => s.name === 'Asignado');
    expect(assigned).toMatchObject({ kind: 'deployable', isSystem: true });
  });

  it('crea estados con tipo y no toca el estado del sistema (409)', async () => {
    const created = await create(operator, 'status-labels', {
      name: 'En tránsito',
      kind: 'pending',
    });
    expect(created).toMatchObject({ kind: 'pending', isSystem: false });
    const list = await reader.get(`${base}/status-labels?q=Asignado`);
    const assigned = list.json().data[0];
    const h = { 'if-match': `"${assigned.updatedAt}"` };
    expect(
      (await operator.patch(`${base}/status-labels/${assigned.id}`, { name: 'Otro' }, h))
        .statusCode,
    ).toBe(409);
    expect(
      (await operator.patch(`${base}/status-labels/${assigned.id}`, { kind: 'archived' }, h))
        .statusCode,
    ).toBe(409);
    expect(
      (await operator.patch(`${base}/status-labels/${assigned.id}`, { active: false }, h))
        .statusCode,
    ).toBe(409);
    expect((await operator.delete(`${base}/status-labels/${assigned.id}`)).statusCode).toBe(409);
  });
});
