import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from '../../../test/app.js';

/** [P40] La auditoría identifica el registro afectado con un rótulo guardado al momento del evento. */
let env: TestEnv;
let admin: TestClient;
const base = '/api/v1';
const hdr = (v: string) => ({ 'if-match': `"${v}"` });
const ids = { model: '', wh: '', available: '' };

type Created = { id: string; updatedAt: string; assetTag?: string };
async function post(path: string, body: unknown): Promise<Created> {
  const res = await admin.post(`${base}/${path}`, body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as Created;
}
/** El endpoint no filtra por `entityId`: se filtra aquí (es lo que haría la pantalla al mostrar el registro). */
const auditOf = async (entity: string, id: string) =>
  (await audit(`entity=${entity}`)).filter((r) => r.entityId === id);
const audit = async (query: string) => {
  const res = await admin.get(`${base}/audit?pageSize=100&${query}`);
  expect(res.statusCode, res.body).toBe(200);
  return res.json().data as {
    action: string;
    entity: string;
    entityId: string | null;
    entityLabel: string | null;
    entityLinkable: boolean;
    diff: Record<string, unknown> | null;
  }[];
};

beforeAll(async () => {
  env = await createTestEnv();
  await env.createUser({ email: 'admin@ejemplo.cl', role: 'Administrador', name: 'Ada Admin' });
  admin = env.client('10.50.0.1');
  await admin.login('admin@ejemplo.cl');
  const m = await post('manufacturers', { name: 'Acme' });
  const c = await post('categories', { name: 'Notebooks' });
  ids.model = (
    await post('models', { name: 'Modelo A', manufacturerId: m.id, categoryId: c.id })
  ).id;
  ids.wh = (await post('locations', { name: 'Bodega Norte', type: 'warehouse' })).id;
  ids.available = (
    (await admin.get(`${base}/status-labels?q=Disponible`)).json().data as {
      id: string;
      name: string;
    }[]
  ).find((s) => s.name === 'Disponible')!.id;
});
afterAll(async () => env.close());

describe('rótulo del registro afectado [P40]', () => {
  it('un activo se rotula con etiqueta + nombre en todas sus acciones', async () => {
    const a = await post('assets', {
      name: 'Notebook de Ana',
      modelId: ids.model,
      statusId: ids.available,
      baseLocationId: ids.wh,
    });
    const label = `${a.assetTag} Notebook de Ana`;
    await admin.post(`${base}/assets/${a.id}/status`, {
      statusId: (
        (await admin.get(`${base}/status-labels?q=reparaci`)).json().data as { id: string }[]
      )[0]!.id,
      note: 'pantalla',
    });
    const rows = await auditOf('asset', a.id);
    expect(rows.map((r) => r.action)).toEqual(['asset.status_change', 'asset.create']);
    for (const r of rows) {
      expect(r.entityLabel).toBe(label);
      expect(r.entityLinkable).toBe(true);
    }
  });

  it('si el registro se renombra, cada evento conserva el rótulo de su momento', async () => {
    const a = await post('assets', {
      name: 'Nombre original',
      modelId: ids.model,
      statusId: ids.available,
      baseLocationId: ids.wh,
    });
    const upd = await admin.patch(
      `${base}/assets/${a.id}`,
      { name: 'Nombre nuevo' },
      hdr(a.updatedAt),
    );
    expect(upd.statusCode).toBe(200);
    const rows = await auditOf('asset', a.id);
    expect(rows.map((r) => r.entityLabel)).toEqual([
      `${a.assetTag} Nombre nuevo`, // el evento de edición, ya con el nombre nuevo
      `${a.assetTag} Nombre original`, // el alta conserva el original
    ]);
  });

  it('un activo dado de baja deja de ser enlazable pero conserva su rótulo, estado y motivo', async () => {
    const a = await post('assets', {
      name: 'Para baja',
      modelId: ids.model,
      statusId: ids.available,
      baseLocationId: ids.wh,
    });
    const del = await admin.request({
      method: 'DELETE',
      url: `${base}/assets/${a.id}`,
      payload: { reason: 'Equipo robado' },
    });
    expect(del.statusCode).toBe(204);
    const rows = await auditOf('asset', a.id);
    const baja = rows.find((r) => r.action === 'asset.delete')!;
    expect(baja.entityLabel).toBe(`${a.assetTag} Para baja`);
    expect(baja.entityLinkable).toBe(false);
    expect(baja.diff).toEqual({
      before: { situation: 'vigente' },
      after: { situation: 'baja', reason: 'Equipo robado' },
      context: { status: 'Disponible' },
    });
    // Restaurar lo vuelve enlazable otra vez.
    await admin.post(`${base}/assets/${a.id}/restore`);
    const after = await auditOf('asset', a.id);
    expect(after[0]!.action).toBe('asset.restore');
    expect(after[0]!.entityLinkable).toBe(true);
    expect(after[0]!.diff).toMatchObject({
      before: { situation: 'baja', reason: 'Equipo robado' },
      after: { situation: 'vigente' },
    });
  });

  it('catálogo y usuarios se rotulan por nombre; lo borrado conserva su rótulo y deja de enlazar', async () => {
    const cat = await post('categories', { name: 'Categoría efímera' });
    const upd = await admin.patch(
      `${base}/categories/${cat.id}`,
      { name: 'Categoría renombrada' },
      hdr(cat.updatedAt),
    );
    expect(upd.statusCode).toBe(200);
    const del = await admin.request({ method: 'DELETE', url: `${base}/categories/${cat.id}` });
    expect(del.statusCode).toBe(204);
    const rows = await auditOf('category', cat.id);
    expect(rows.map((r) => [r.action, r.entityLabel])).toEqual([
      ['category.delete', 'Categoría renombrada'],
      ['category.update', 'Categoría renombrada'],
      ['category.create', 'Categoría efímera'],
    ]);
    expect(rows.every((r) => !r.entityLinkable)).toBe(true);

    const users = await audit('entity=user');
    expect(users.some((r) => r.entityLabel === 'Ada Admin')).toBe(true);
  });

  it('un alta en lote rotula cada activo y el lote', async () => {
    const res = await admin.post(`${base}/assets/batch`, {
      modelId: ids.model,
      quantity: 3,
      baseLocationId: ids.wh,
      statusId: ids.available,
      name: 'Sensor',
    });
    expect(res.statusCode, res.body).toBe(201);
    const batch = await audit('action=asset.batch_create');
    expect(batch[0]!.entityLabel).toBe('Lote de 3 activos');
    expect(batch[0]!.entityLinkable).toBe(false);
    const tag = (res.json().assets as { assetTag: string }[])[0]!.assetTag;
    const created = (await audit('action=asset.create')).find((r) =>
      r.entityLabel?.startsWith(tag),
    );
    expect(created?.entityLabel).toBe(`${tag} Sensor`);
  });
});
