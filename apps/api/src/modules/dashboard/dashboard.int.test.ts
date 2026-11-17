import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from '../../../test/app.js';

let env: TestEnv;
let admin: TestClient;
let tech: TestClient;
let techId: string;
const base = '/api/v1';
const ids = { model: '', cat: '', wh: '', wh2: '', available: '', repair: '', pending: '' };

async function post<T>(c: TestClient, path: string, body: unknown) {
  const res = await c.post(`${base}/${path}`, body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as T & { id: string; updatedAt: string };
}
const statusId = async (name: string) =>
  (await admin.get(`${base}/status-labels?q=${encodeURIComponent(name)}`))
    .json()
    .data.find((s: { name: string }) => s.name === name).id as string;
const asset = (extra: Record<string, unknown> = {}) =>
  post<{ assetTag: string }>(admin, 'assets', {
    name: 'Equipo',
    modelId: ids.model,
    statusId: ids.available,
    baseLocationId: ids.wh,
    ...extra,
  });
const summary = async (c = admin) => {
  const res = await c.get(`${base}/dashboard`);
  expect(res.statusCode, res.body).toBe(200);
  return res.json();
};

beforeAll(async () => {
  env = await createTestEnv();
  await env.createUser({ email: 'admin@ejemplo.cl', role: 'Administrador' });
  techId = await env.createUser({
    email: 'tec@ejemplo.cl',
    role: 'Técnico de campo',
    name: 'Tomás Técnico',
  });
  admin = env.client('10.7.0.1');
  tech = env.client('10.7.0.2');
  await admin.login('admin@ejemplo.cl');
  await tech.login('tec@ejemplo.cl');
  const m = await post<unknown>(admin, 'manufacturers', { name: 'Acme' });
  ids.cat = (await post(admin, 'categories', { name: 'Notebooks' })).id;
  ids.model = (
    await post(admin, 'models', {
      name: 'Modelo A',
      manufacturerId: (m as { id: string }).id,
      categoryId: ids.cat,
    })
  ).id;
  ids.wh = (await post(admin, 'locations', { name: 'Bodega Norte', type: 'warehouse' })).id;
  ids.wh2 = (await post(admin, 'locations', { name: 'Bodega Sur', type: 'warehouse' })).id;
  ids.available = await statusId('Disponible');
  ids.repair = await statusId('En reparación');
  ids.pending = await statusId('Pendiente de configuración');
});
afterAll(async () => env.close());

describe('GET /dashboard (RF-28)', () => {
  it('con la base vacía devuelve ceros y listas vacías', async () => {
    const s = await summary();
    expect(s.totals).toEqual({ total: 0, available: 0, assigned: 0, pendingSetup: 0 });
    expect(s.byCategory).toEqual([]);
    expect(s.stockByWarehouse).toEqual([]);
    expect(s.overdue).toEqual({ count: 0, items: [] });
    expect(s.recent).toEqual([]);
    expect(s.mine).toEqual([]);
  });

  it('cuenta por tipo de estado, asignación, categoría y bodega base', async () => {
    const a = await asset();
    await asset();
    await asset({ baseLocationId: ids.wh2 });
    await asset({ statusId: ids.repair });
    await asset({ statusId: ids.pending });
    await admin.post(`${base}/assets/${a.id}/checkout`, { userId: techId });
    const s = await summary();
    expect(s.totals).toEqual({ total: 5, available: 2, assigned: 1, pendingSetup: 1 });
    // Cada estado aparece con su nombre real y su tipo; no hay filas por tipo.
    const kinds: Record<string, number> = {};
    for (const st of s.byStatus as { kind: string; count: number }[]) {
      kinds[st.kind] = (kinds[st.kind] ?? 0) + st.count;
    }
    expect(kinds).toMatchObject({ deployable: 3, undeployable: 1, pending: 1 });
    expect(s.byStatus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Disponible', kind: 'deployable' }),
        expect.objectContaining({ name: 'Pendiente de configuración', kind: 'pending' }),
      ]),
    );
    expect(s.byCategory).toEqual([{ id: ids.cat, name: 'Notebooks', count: 5 }]);
    // Stock = disponibles (sin asignar) por bodega base.
    expect(s.stockByWarehouse).toEqual(
      expect.arrayContaining([
        { id: ids.wh, name: 'Bodega Norte', count: 1 },
        { id: ids.wh2, name: 'Bodega Sur', count: 1 },
      ]),
    );
  });

  it('renombrar un estado no cambia los conteos (se agrupa por tipo)', async () => {
    const before = await summary();
    const st = (await admin.get(`${base}/status-labels?q=Pendiente`)).json().data[0];
    const renamed = await admin.patch(
      `${base}/status-labels/${st.id}`,
      { name: 'Por configurar' },
      { 'if-match': `"${st.updatedAt}"` },
    );
    expect(renamed.statusCode).toBe(200);
    const after = await summary();
    expect(after.totals).toEqual(before.totals);
    // El desglose muestra el nombre nuevo, con los mismos conteos y tipos.
    const strip = (r: { byStatus: { kind: string; count: number }[] }) =>
      r.byStatus.map((x) => [x.kind, x.count]);
    expect(strip(after)).toEqual(strip(before));
  });

  it('los dados de baja no cuentan', async () => {
    const a = await asset();
    const before = await summary();
    await admin.request({
      method: 'DELETE',
      url: `${base}/assets/${a.id}`,
      payload: { reason: 'x' },
    });
    const after = await summary();
    expect(after.totals.total).toBe(before.totals.total - 1);
  });

  it('lista las devoluciones atrasadas y los últimos movimientos con su activo', async () => {
    const late = await asset({ name: 'Atrasado' });
    await admin.post(`${base}/assets/${late.id}/checkout`, {
      userId: techId,
      expectedReturnOn: '2020-01-01',
    });
    const s = await summary();
    expect(s.overdue.count).toBe(1);
    expect(s.overdue.items[0]).toMatchObject({
      id: late.id,
      name: 'Atrasado',
      assignedTo: 'Tomás Técnico',
      expectedReturnOn: '2020-01-01',
    });
    expect(s.recent).toHaveLength(5);
    expect(s.recent[0]).toMatchObject({
      action: 'asset.checkout',
      assetId: late.id,
      assetName: 'Atrasado',
    });
  });

  it('«mine» trae solo lo asignado a quien consulta', async () => {
    const t = await summary(tech);
    expect(t.mine.map((m: { name: string }) => m.name)).toContain('Atrasado');
    expect(t.mine.every((m: { id: string }) => typeof m.id === 'string')).toBe(true);
    const a = await summary(admin);
    expect(a.mine).toEqual([]);
  });

  it('exige asset:read y sesión', async () => {
    expect((await env.client('10.7.0.9').get(`${base}/dashboard`)).statusCode).toBe(401);
  });
});
