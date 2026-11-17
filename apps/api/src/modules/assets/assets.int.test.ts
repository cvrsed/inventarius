import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from '../../../test/app.js';

let env: TestEnv;
let admin: TestClient;
let operator: TestClient;
let tech: TestClient;
let reader: TestClient;
let techId: string;
let operatorId: string;

const base = '/api/v1';
const ids = {
  model: '',
  loraModel: '',
  category: '',
  loraCategory: '',
  available: '',
  repair: '',
  retired: '',
  assigned: '',
  room: '',
  other: '',
};

const hdr = (v: string) => ({ 'if-match': `"${v}"` });

async function post<T = Record<string, unknown>>(c: TestClient, path: string, body: unknown) {
  const res = await c.post(`${base}/${path}`, body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as T & { id: string; updatedAt: string };
}

async function statusId(name: string): Promise<string> {
  const res = await admin.get(`${base}/status-labels?q=${encodeURIComponent(name)}`);
  return res.json().data.find((s: { name: string }) => s.name === name).id;
}

let seq = 0;
/** Crea un activo mínimo con valores únicos. */
async function newAsset(extra: Record<string, unknown> = {}, client = operator) {
  seq += 1;
  return post<{ assetTag: string }>(client, 'assets', {
    name: `Sensor ${seq}`,
    modelId: ids.model,
    statusId: ids.available,
    ...extra,
  });
}

beforeAll(async () => {
  env = await createTestEnv();
  await env.createUser({ email: 'admin@ejemplo.cl', role: 'Administrador' });
  operatorId = await env.createUser({
    email: 'op@ejemplo.cl',
    role: 'Operador',
    name: 'Olga Operadora',
  });
  techId = await env.createUser({
    email: 'tec@ejemplo.cl',
    role: 'Técnico de campo',
    name: 'Tomás Técnico',
  });
  await env.createUser({ email: 'lector@ejemplo.cl', role: 'Lector' });
  admin = env.client('10.2.0.1');
  operator = env.client('10.2.0.2');
  tech = env.client('10.2.0.3');
  reader = env.client('10.2.0.4');
  await admin.login('admin@ejemplo.cl');
  await operator.login('op@ejemplo.cl');
  await tech.login('tec@ejemplo.cl');
  await reader.login('lector@ejemplo.cl');

  const manufacturer = await post(operator, 'manufacturers', { name: 'Acme' });
  ids.category = (await post(operator, 'categories', { name: 'Notebooks' })).id;
  ids.loraCategory = (
    await post(operator, 'categories', { name: 'Medidores', extension: 'lorawan' })
  ).id;
  ids.model = (
    await post(operator, 'models', {
      name: 'Modelo A',
      manufacturerId: manufacturer.id,
      categoryId: ids.category,
    })
  ).id;
  ids.loraModel = (
    await post(operator, 'models', {
      name: 'Modelo L',
      manufacturerId: manufacturer.id,
      categoryId: ids.loraCategory,
      lorawanClass: 'A',
    })
  ).id;
  ids.available = await statusId('Disponible');
  ids.repair = await statusId('En reparación');
  ids.retired = await statusId('Dado de baja');
  ids.assigned = await statusId('Asignado');
  ids.room = (await post(operator, 'locations', { name: 'Sala 1' })).id;
  ids.other = (await post(operator, 'locations', { name: 'Bodega' })).id;
});
afterAll(async () => env.close());

describe('alta de activos (RF-20)', () => {
  it('autogenera la etiqueta con el prefijo y el correlativo (D6)', async () => {
    const a = await newAsset();
    const b = await newAsset();
    expect(a.assetTag).toMatch(/^INV-\d{6}$/);
    expect(Number(b.assetTag.slice(4))).toBe(Number(a.assetTag.slice(4)) + 1);
  });

  it('acepta etiqueta propia y rechaza repetirla sin distinguir mayúsculas (409)', async () => {
    await newAsset({ assetTag: 'Lab-007' });
    const dup = await operator.post(`${base}/assets`, {
      name: 'Otro',
      modelId: ids.model,
      statusId: ids.available,
      assetTag: 'LAB-007',
    });
    expect(dup.statusCode).toBe(409);
  });

  it('guarda y devuelve todos los datos, con ETag y fin de garantía', async () => {
    const res = await operator.post(`${base}/assets`, {
      name: 'Notebook de Ana',
      serial: 'SN-1',
      modelId: ids.model,
      statusId: ids.available,
      locationId: ids.room,
      purchaseDate: '2026-01-31',
      purchaseCost: 499990.5,
      supplier: 'Proveedor SpA',
      warrantyMonths: 1,
      notes: 'Con cargador',
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.headers['etag']).toBeTruthy();
    expect(res.json()).toMatchObject({
      name: 'Notebook de Ana',
      serial: 'SN-1',
      purchaseDate: '2026-01-31',
      purchaseCost: 499990.5,
      supplier: 'Proveedor SpA',
      warrantyMonths: 1,
      warrantyEndsOn: '2026-02-28',
      notes: 'Con cargador',
      model: { id: ids.model, name: 'Modelo A' },
      manufacturer: { name: 'Acme' },
      category: { id: ids.category, extension: 'none' },
      status: { id: ids.available, kind: 'deployable' },
      location: { id: ids.room, name: 'Sala 1' },
      assignedUser: null,
      deleted: false,
    });
  });

  it('solo Administrador y Operador escriben; Técnico y Lector no (403)', async () => {
    const body = { name: 'x', modelId: ids.model, statusId: ids.available };
    expect((await tech.post(`${base}/assets`, body)).statusCode).toBe(403);
    expect((await reader.post(`${base}/assets`, body)).statusCode).toBe(403);
    expect((await admin.post(`${base}/assets`, body)).statusCode).toBe(201);
  });

  it('valida las referencias: inexistentes, inactivas y el estado de sistema (422)', async () => {
    const ghost = '018f0000-0000-7000-8000-00000000dead';
    const call = (extra: Record<string, unknown>) =>
      operator.post(`${base}/assets`, {
        name: 'x',
        modelId: ids.model,
        statusId: ids.available,
        ...extra,
      });
    expect((await call({ modelId: ghost })).statusCode).toBe(422);
    expect((await call({ statusId: ghost })).statusCode).toBe(422);
    expect((await call({ locationId: ghost })).statusCode).toBe(422);
    const asg = await call({ statusId: ids.assigned });
    expect(asg.statusCode).toBe(422);
    expect(asg.json().errors.statusId).toBeTruthy();
    const inactive = await post(operator, 'locations', { name: 'Cerrada' });
    await operator.patch(
      `${base}/locations/${inactive.id}`,
      { active: false },
      hdr(inactive.updatedAt),
    );
    expect((await call({ locationId: inactive.id })).statusCode).toBe(422);
  });

  it('deja el alta en auditoría (RF-30)', async () => {
    const a = await newAsset();
    const audit = await admin.get(`${base}/audit?entity=asset&action=asset.create&pageSize=100`);
    expect(audit.json().data.some((e: { entityId: string }) => e.entityId === a.id)).toBe(true);
  });
});

describe('edición, concurrencia e historial (RF-24)', () => {
  it('PATCH exige If-Match (428) y detecta ediciones simultáneas (412)', async () => {
    const a = await newAsset();
    expect((await operator.patch(`${base}/assets/${a.id}`, { name: 'Nuevo' })).statusCode).toBe(
      428,
    );
    const ok = await operator.patch(`${base}/assets/${a.id}`, { name: 'Nuevo' }, hdr(a.updatedAt));
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().name).toBe('Nuevo');
    expect(
      (await operator.patch(`${base}/assets/${a.id}`, { name: 'Otro' }, hdr(a.updatedAt)))
        .statusCode,
    ).toBe(412);
  });

  it('borra opcionales con null y valida unicidad de la etiqueta al editarla', async () => {
    const a = await newAsset({ serial: 'ZZ', notes: 'n' });
    const other = await newAsset({ assetTag: 'TAKEN-1' });
    const res = await operator.patch(
      `${base}/assets/${a.id}`,
      { serial: null, notes: null },
      hdr(a.updatedAt),
    );
    expect(res.json()).toMatchObject({ serial: null, notes: null });
    const dup = await operator.patch(
      `${base}/assets/${a.id}`,
      { assetTag: 'taken-1' },
      hdr(res.json().updatedAt),
    );
    expect(dup.statusCode).toBe(409);
    expect(other.assetTag).toBe('TAKEN-1');
  });

  it('no deja poner a mano el estado «Asignado» (422)', async () => {
    const a = await newAsset();
    const res = await operator.patch(
      `${base}/assets/${a.id}`,
      { statusId: ids.assigned },
      hdr(a.updatedAt),
    );
    expect(res.statusCode).toBe(422);
  });

  it('el historial lista creación y cambios con antes/después, el más reciente primero', async () => {
    const a = await newAsset({ name: 'Historial' });
    const first = await operator.patch(
      `${base}/assets/${a.id}`,
      { name: 'Historial 2', statusId: ids.repair },
      hdr(a.updatedAt),
    );
    await operator.patch(
      `${base}/assets/${a.id}`,
      { locationId: ids.room },
      hdr(first.json().updatedAt),
    );
    const res = await reader.get(`${base}/assets/${a.id}/history`);
    expect(res.statusCode).toBe(200);
    const actions = res.json().data.map((e: { action: string }) => e.action);
    expect(actions).toEqual(['asset.update', 'asset.update', 'asset.create']);
    const nameChange = res.json().data[1];
    expect(nameChange.actorName).toBe('Olga Operadora');
    expect(nameChange.diff.before).toMatchObject({ name: 'Historial', status: 'Disponible' });
    expect(nameChange.diff.after).toMatchObject({ name: 'Historial 2', status: 'En reparación' });
  });
});

describe('listado (RF-22)', () => {
  let a: { id: string; assetTag: string };
  beforeAll(async () => {
    a = await newAsset({
      name: 'Zorzal azul',
      serial: 'QWERTY-99',
      statusId: ids.repair,
      locationId: ids.other,
    });
    await newAsset({ name: 'Zorzal rojo', modelId: ids.loraModel, locationId: ids.room });
  });

  it('busca por etiqueta, nombre o serie, sin distinguir mayúsculas', async () => {
    const byName = await reader.get(`${base}/assets?q=zorzal`);
    expect(byName.json().meta.total).toBe(2);
    const bySerial = await reader.get(`${base}/assets?q=qwerty`);
    expect(bySerial.json().data.map((x: { id: string }) => x.id)).toEqual([a.id]);
    const byTag = await reader.get(`${base}/assets?q=${a.assetTag.toLowerCase()}`);
    expect(byTag.json().data.map((x: { id: string }) => x.id)).toContain(a.id);
  });

  it('un % en la búsqueda se toma literal, no como comodín', async () => {
    expect((await reader.get(`${base}/assets?q=%25`)).json().meta.total).toBe(0);
  });

  it('filtra por categoría, modelo, estado y ubicación', async () => {
    const q = (s: string) =>
      reader.get(`${base}/assets?q=zorzal&${s}`).then((r) => r.json().meta.total);
    expect(await q(`categoryId=${ids.loraCategory}`)).toBe(1);
    expect(await q(`modelId=${ids.model}`)).toBe(1);
    expect(await q(`statusId=${ids.repair}`)).toBe(1);
    expect(await q(`locationId=${ids.room}`)).toBe(1);
    expect(await q(`statusId=${ids.repair}&locationId=${ids.room}`)).toBe(0);
  });

  it('ordena y pagina del lado servidor, con desempate estable', async () => {
    const asc = await reader.get(`${base}/assets?q=zorzal&sort=name&pageSize=1&page=1`);
    expect(asc.json().data[0].name).toBe('Zorzal azul');
    expect(asc.json().meta).toEqual({ page: 1, pageSize: 1, total: 2 });
    const desc = await reader.get(`${base}/assets?q=zorzal&sort=-name&pageSize=1`);
    expect(desc.json().data[0].name).toBe('Zorzal rojo');
    const p2 = await reader.get(`${base}/assets?q=zorzal&sort=name&pageSize=1&page=2`);
    expect(p2.json().data[0].name).toBe('Zorzal rojo');
  });

  it('rechaza un orden desconocido y un tamaño de página mayor a 100 (400)', async () => {
    expect((await reader.get(`${base}/assets?sort=password`)).statusCode).toBe(400);
    expect((await reader.get(`${base}/assets?pageSize=101`)).statusCode).toBe(400);
  });
});

describe('asignación (RF-23)', () => {
  it('asigna a un usuario: queda «Asignado», con fecha esperada y nota', async () => {
    const a = await newAsset();
    const res = await tech.post(`${base}/assets/${a.id}/checkout`, {
      userId: operatorId,
      expectedReturnOn: '2026-12-31',
      note: 'Para terreno',
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({
      status: { name: 'Asignado' },
      assignedUser: { id: operatorId, name: 'Olga Operadora' },
      assignedLocation: null,
      assignment: { expectedReturnOn: '2026-12-31', note: 'Para terreno' },
    });
    const filtered = await reader.get(`${base}/assets?assignedUserId=${operatorId}`);
    expect(filtered.json().data.map((x: { id: string }) => x.id)).toContain(a.id);
  });

  it('asigna a una ubicación', async () => {
    const a = await newAsset();
    const res = await operator.post(`${base}/assets/${a.id}/checkout`, { locationId: ids.room });
    expect(res.json()).toMatchObject({ assignedLocation: { id: ids.room }, assignedUser: null });
  });

  it('solo los activos en estado desplegable se asignan (422) y no dos veces (409)', async () => {
    const broken = await newAsset({ statusId: ids.repair });
    expect(
      (await operator.post(`${base}/assets/${broken.id}/checkout`, { userId: techId })).statusCode,
    ).toBe(422);
    const a = await newAsset();
    expect(
      (await operator.post(`${base}/assets/${a.id}/checkout`, { userId: techId })).statusCode,
    ).toBe(200);
    expect(
      (await operator.post(`${base}/assets/${a.id}/checkout`, { userId: operatorId })).statusCode,
    ).toBe(409);
  });

  it('dos asignaciones simultáneas: solo una gana', async () => {
    const a = await newAsset();
    const [x, y] = await Promise.all([
      operator.post(`${base}/assets/${a.id}/checkout`, { userId: techId }),
      admin.post(`${base}/assets/${a.id}/checkout`, { userId: operatorId }),
    ]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([200, 409]);
  });

  it('exige usuario activo o ubicación activa y respeta el permiso (422 / 403)', async () => {
    const a = await newAsset();
    const inactive = await env.createUser({
      email: 'baja@ejemplo.cl',
      role: 'Lector',
      active: false,
    });
    expect(
      (await operator.post(`${base}/assets/${a.id}/checkout`, { userId: inactive })).statusCode,
    ).toBe(422);
    expect(
      (
        await operator.post(`${base}/assets/${a.id}/checkout`, {
          userId: '018f0000-0000-7000-8000-00000000dead',
        })
      ).statusCode,
    ).toBe(422);
    expect((await operator.post(`${base}/assets/${a.id}/checkout`, {})).statusCode).toBe(400);
    expect(
      (await reader.post(`${base}/assets/${a.id}/checkout`, { userId: techId })).statusCode,
    ).toBe(403);
  });

  it('el check-in devuelve el activo con el estado elegido y deja el rastro', async () => {
    const a = await newAsset({ name: 'Ida y vuelta' });
    await tech.post(`${base}/assets/${a.id}/checkout`, { userId: techId, note: 'sale' });
    const back = await tech.post(`${base}/assets/${a.id}/checkin`, {
      statusId: ids.repair,
      note: 'vuelve con falla',
    });
    expect(back.statusCode, back.body).toBe(200);
    expect(back.json()).toMatchObject({
      status: { id: ids.repair },
      assignedUser: null,
      assignedLocation: null,
      assignment: null,
    });
    expect(
      (await tech.post(`${base}/assets/${a.id}/checkin`, { statusId: ids.available })).statusCode,
    ).toBe(409);
    const history = await reader.get(`${base}/assets/${a.id}/history`);
    expect(history.json().data.map((e: { action: string }) => e.action)).toEqual([
      'asset.checkin',
      'asset.checkout',
      'asset.create',
    ]);
    expect(history.json().data[1].diff.after).toMatchObject({
      assignedTo: 'Tomás Técnico',
      note: 'sale',
    });
  });

  it('un activo asignado no cambia de estado ni se da de baja hasta devolverlo (409)', async () => {
    const a = await newAsset();
    const out = await operator.post(`${base}/assets/${a.id}/checkout`, { userId: techId });
    const st = await operator.patch(
      `${base}/assets/${a.id}`,
      { statusId: ids.repair },
      hdr(out.json().updatedAt),
    );
    expect(st.statusCode).toBe(409);
    const del = await operator.request({
      method: 'DELETE',
      url: `${base}/assets/${a.id}`,
      payload: { reason: 'x' },
    });
    expect(del.statusCode).toBe(409);
  });

  it('lista usuarios asignables solo con nombre (sin correo)', async () => {
    const res = await tech.get(`${base}/assignees?q=olga`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ id: operatorId, name: 'Olga Operadora' }]);
    const byId = await tech.get(`${base}/assignees?id=${operatorId}`);
    expect(byId.json()).toEqual([{ id: operatorId, name: 'Olga Operadora' }]);
    expect((await reader.get(`${base}/assignees`)).statusCode).toBe(403);
  });
});

describe('baja lógica y restauración (RF-25)', () => {
  it('da de baja con motivo, sale del listado y se ve en la papelera', async () => {
    const a = await newAsset({ name: 'Para la papelera' });
    const del = await operator.request({
      method: 'DELETE',
      url: `${base}/assets/${a.id}`,
      payload: { reason: 'Robo' },
    });
    expect(del.statusCode, del.body).toBe(204);
    expect((await reader.get(`${base}/assets?q=papelera`)).json().meta.total).toBe(0);
    const trash = await reader.get(`${base}/assets?q=papelera&deleted=only`);
    expect(trash.json().data[0]).toMatchObject({ id: a.id, deleted: true });
    const detail = await reader.get(`${base}/assets/${a.id}`);
    expect(detail.json()).toMatchObject({ deleted: true, deleteReason: 'Robo' });
  });

  it('exige motivo y permiso asset:delete', async () => {
    const a = await newAsset();
    expect(
      (await operator.request({ method: 'DELETE', url: `${base}/assets/${a.id}`, payload: {} }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await tech.request({
          method: 'DELETE',
          url: `${base}/assets/${a.id}`,
          payload: { reason: 'x' },
        })
      ).statusCode,
    ).toBe(403);
  });

  it('un activo dado de baja no se edita ni se asigna (409); solo un administrador lo restaura', async () => {
    const a = await newAsset();
    await operator.request({
      method: 'DELETE',
      url: `${base}/assets/${a.id}`,
      payload: { reason: 'Baja' },
    });
    const cur = (await reader.get(`${base}/assets/${a.id}`)).json();
    expect(
      (await operator.patch(`${base}/assets/${a.id}`, { name: 'z' }, hdr(cur.updatedAt)))
        .statusCode,
    ).toBe(409);
    expect(
      (await operator.post(`${base}/assets/${a.id}/checkout`, { userId: techId })).statusCode,
    ).toBe(409);
    expect((await operator.post(`${base}/assets/${a.id}/restore`)).statusCode).toBe(403);
    const restored = await admin.post(`${base}/assets/${a.id}/restore`);
    expect(restored.statusCode, restored.body).toBe(200);
    expect(restored.json()).toMatchObject({ deleted: false, deleteReason: null });
    expect((await admin.post(`${base}/assets/${a.id}/restore`)).statusCode).toBe(409);
    const actions = (await reader.get(`${base}/assets/${a.id}/history`))
      .json()
      .data.map((e: { action: string }) => e.action);
    expect(actions).toEqual(['asset.restore', 'asset.delete', 'asset.create']);
  });

  it('un 404 limpio para un id inexistente', async () => {
    expect(
      (await reader.get(`${base}/assets/018f0000-0000-7000-8000-00000000dead`)).statusCode,
    ).toBe(404);
  });
});

describe('exportación CSV (RF-26)', () => {
  it('exporta el listado filtrado, con encabezado y sin fórmulas peligrosas', async () => {
    await newAsset({ name: '=HYPERLINK("http://x")', serial: 'CSV-1', notes: 'a, "b"' });
    await newAsset({ name: 'Otro CSV' });
    const res = await reader.get(`${base}/assets/export?q=CSV-1`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="activos-.*\.csv"/);
    const lines = res.body
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toMatch(/^Etiqueta,Nombre,Serie/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(lines[1]).toContain('"a, ""b"""');
  });

  it('respeta los filtros y el permiso de lectura', async () => {
    const all = await reader.get(`${base}/assets/export`);
    expect(all.body.trim().split('\r\n').length).toBeGreaterThan(5);
    const none = await reader.get(`${base}/assets/export?q=no-existe-jamas`);
    expect(none.body.trim().split('\r\n')).toHaveLength(1);
    expect((await env.client('10.2.9.9').get(`${base}/assets/export`)).statusCode).toBe(401);
  });
});
