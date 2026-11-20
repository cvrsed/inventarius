import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from '../../../test/app.js';

const base = '/api/v1';
let env: TestEnv;
let admin: TestClient;
let operator: TestClient;
let tech: TestClient;
let reader: TestClient;
let techId: string;

const ids = {
  catConsumable: '',
  catAsset: '',
  par: '',
  litro: '',
  unidad: '',
  main: '',
  annex: '',
  site: '',
};

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function create(c: TestClient, path: string, body: unknown): Promise<Json> {
  const res = await c.post(`${base}/${path}`, body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
}

let seq = 0;
/** Consumible nuevo con nombre único. */
async function newConsumable(extra: Json = {}, c = operator): Promise<Json> {
  seq += 1;
  return create(c, 'consumables', {
    name: `Guantes ${seq}`,
    categoryId: ids.catConsumable,
    unitId: ids.par,
    ...extra,
  });
}

const move = (c: TestClient, id: string, kind: string, body: unknown) =>
  c.post(`${base}/consumables/${id}/${kind}`, body);

async function stock(id: string): Promise<Record<string, string>> {
  const res = await admin.get(`${base}/consumables/${id}`);
  expect(res.statusCode, res.body).toBe(200);
  return Object.fromEntries(
    res.json().stockByWarehouse.map((s: Json) => [s.location.id, s.quantity]),
  );
}

const receive = async (id: string, locationId: string, quantity: string, c = operator) => {
  const res = await move(c, id, 'receipts', { locationId, quantity });
  expect(res.statusCode, res.body).toBe(201);
  return res.json();
};

beforeAll(async () => {
  env = await createTestEnv();
  await env.createUser({ email: 'admin@ejemplo.cl', role: 'Administrador', name: 'Ada Admin' });
  await env.createUser({ email: 'op@ejemplo.cl', role: 'Operador', name: 'Olga Operadora' });
  techId = await env.createUser({
    email: 'tec@ejemplo.cl',
    role: 'Técnico de campo',
    name: 'Tomás Técnico',
  });
  await env.createUser({ email: 'lector@ejemplo.cl', role: 'Lector' });
  admin = env.client('10.5.0.1');
  operator = env.client('10.5.0.2');
  tech = env.client('10.5.0.3');
  reader = env.client('10.5.0.4');
  await admin.login('admin@ejemplo.cl');
  await operator.login('op@ejemplo.cl');
  await tech.login('tec@ejemplo.cl');
  await reader.login('lector@ejemplo.cl');

  ids.catConsumable = (
    await create(operator, 'categories', { name: 'EPP', scope: 'consumable' })
  ).id;
  ids.catAsset = (await create(operator, 'categories', { name: 'Sensores' })).id;
  const units = (await admin.get(`${base}/measure-units?pageSize=100`)).json().data as Json[];
  const unit = (name: string) => units.find((u) => u.name === name)!.id;
  ids.par = unit('par');
  ids.litro = unit('litro');
  ids.unidad = unit('unidad');
  ids.main = (
    await create(operator, 'locations', { name: 'Bodega central', type: 'warehouse' })
  ).id;
  ids.annex = (await create(operator, 'locations', { name: 'Bodega anexo', type: 'warehouse' })).id;
  ids.site = (
    await create(operator, 'locations', { name: 'Obra norte', type: 'customer_site' })
  ).id;
});

afterAll(async () => {
  await env.close();
});

describe('unidades de medida (D4)', () => {
  it('trae la semilla con sus decimales', async () => {
    const units = (await reader.get(`${base}/measure-units?pageSize=100`)).json().data as Json[];
    const by = Object.fromEntries(units.map((u) => [u.name, u.decimals]));
    expect(by).toMatchObject({
      unidad: 0,
      par: 0,
      caja: 0,
      litro: 3,
      metro: 2,
      kilogramo: 3,
    });
  });

  it('se administra con consumables:manage y se valida', async () => {
    expect((await reader.post(`${base}/measure-units`, {})).statusCode).toBe(403);
    const bad = await operator.post(`${base}/measure-units`, {
      name: 'rollo',
      plural: 'rollos',
      abbreviation: 'rollo',
      decimals: 4,
    });
    expect(bad.statusCode).toBe(400);
    const roll = await create(operator, 'measure-units', {
      name: 'rollo',
      plural: 'rollos',
      abbreviation: 'rollo',
      decimals: 0,
    });
    expect(roll.decimals).toBe(0);
    const dup = await operator.post(`${base}/measure-units`, {
      name: 'ROLLO',
      plural: 'rollos',
      abbreviation: 'r',
      decimals: 0,
    });
    expect(dup.statusCode).toBe(409);
  });

  it('una unidad en uso no se borra ni baja de decimales', async () => {
    const unit = await create(operator, 'measure-units', {
      name: 'galón',
      plural: 'galones',
      abbreviation: 'gal',
      decimals: 2,
    });
    await newConsumable({ unitId: unit.id });
    expect((await operator.delete(`${base}/measure-units/${unit.id}`)).statusCode).toBe(409);
    const down = await operator.patch(
      `${base}/measure-units/${unit.id}`,
      { decimals: 1 },
      { 'if-match': `"${unit.updatedAt}"` },
    );
    expect(down.statusCode).toBe(409);
    const up = await operator.patch(
      `${base}/measure-units/${unit.id}`,
      { decimals: 3 },
      { 'if-match': `"${unit.updatedAt}"` },
    );
    expect(up.statusCode, up.body).toBe(200);
  });
});

describe('categorías de consumibles: permiso y unicidad por ámbito (P4, cierra Q57)', () => {
  const cats = (c: TestClient, body: unknown) => c.post(`${base}/categories`, body);

  it('consumables:manage basta para las de consumibles; catalog:write sigue siendo lo de las de activos', async () => {
    const actor = { actorId: null, ip: null };
    await env.services.rbac.createRole(actor, {
      name: 'Solo consumibles',
      description: 'Rol de prueba',
      permissions: ['consumables:read', 'consumables:manage'],
    });
    await env.services.rbac.createRole(actor, {
      name: 'Solo catálogo',
      description: 'Rol de prueba',
      permissions: ['asset:read', 'catalog:write'],
    });
    await env.createUser({ email: 'solo-cons@ejemplo.cl', role: 'Solo consumibles' });
    await env.createUser({ email: 'solo-cat@ejemplo.cl', role: 'Solo catálogo' });
    const consOnly = env.client('10.40.0.1');
    const catOnly = env.client('10.40.0.2');
    await consOnly.login('solo-cons@ejemplo.cl');
    await catOnly.login('solo-cat@ejemplo.cl');

    // consumables:manage: crea, edita y desactiva categorías de consumibles…
    const made = await cats(consOnly, { name: 'Limpieza', scope: 'consumable' });
    expect(made.statusCode, made.body).toBe(201);
    const id = made.json().id as string;
    const version = `"${made.json().updatedAt}"`;
    const renamed = await consOnly.patch(
      `${base}/categories/${id}`,
      { name: 'Aseo' },
      { 'if-match': version },
    );
    expect(renamed.statusCode, renamed.body).toBe(200);
    const off = await consOnly.patch(
      `${base}/categories/${id}`,
      { active: false },
      { 'if-match': `"${renamed.json().updatedAt}"` },
    );
    expect(off.statusCode, off.body).toBe(200);
    // …pero no las de activos (ni crearlas ni tocarlas).
    expect((await cats(consOnly, { name: 'Sensores 2' })).statusCode).toBe(403);
    expect((await cats(consOnly, { name: 'Sensores 3', scope: 'asset' })).statusCode).toBe(403);
    const assetCat = await cats(operator, { name: 'Medidores' });
    expect(
      (
        await consOnly.patch(
          `${base}/categories/${assetCat.json().id}`,
          { name: 'Medidores 2' },
          { 'if-match': `"${assetCat.json().updatedAt}"` },
        )
      ).statusCode,
    ).toBe(403);
    expect((await consOnly.delete(`${base}/categories/${assetCat.json().id}`)).statusCode).toBe(
      403,
    );

    // catalog:write sigue valiendo para las de activos y, sin consumables:manage, no para las de consumibles.
    expect((await cats(catOnly, { name: 'Antenas' })).statusCode).toBe(201);
    expect((await cats(catOnly, { name: 'Pilas', scope: 'consumable' })).statusCode).toBe(403);
    expect((await consOnly.delete(`${base}/categories/${id}`)).statusCode).toBe(204);
    // Quien lee no escribe.
    expect((await cats(reader, { name: 'Nada', scope: 'consumable' })).statusCode).toBe(403);
    expect((await cats(tech, { name: 'Nada', scope: 'consumable' })).statusCode).toBe(403);
  });

  it('el nombre es único por ámbito y sin distinguir mayúsculas; en otro ámbito se puede repetir', async () => {
    expect((await cats(operator, { name: 'Cables', scope: 'consumable' })).statusCode).toBe(201);
    const dup = await cats(operator, { name: 'cables', scope: 'consumable' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().detail).toContain('Ya existe una categoría');
    // El mismo nombre en el ámbito de activos es otra categoría.
    expect((await cats(operator, { name: 'CABLES' })).statusCode).toBe(201);
    expect((await cats(operator, { name: 'cables' })).statusCode).toBe(409);
  });
});

describe('catálogo de consumibles (RF-70)', () => {
  it('crea con categoría de consumibles y unidad; lista con stock total en 0', async () => {
    const c = await newConsumable({ minStock: '10' });
    expect(c).toMatchObject({
      totalStock: '0',
      minStock: '10',
      unit: { name: 'par', decimals: 0 },
      category: { name: 'EPP' },
      active: true,
      hasMovements: false,
    });
    const list = (await reader.get(`${base}/consumables?q=${encodeURIComponent(c.name)}`)).json();
    expect(list.data).toHaveLength(1);
    expect(list.meta.total).toBe(1);
  });

  it('rechaza una categoría de activos, y los modelos rechazan una de consumibles (D11)', async () => {
    const res = await operator.post(`${base}/consumables`, {
      name: 'Cinta',
      categoryId: ids.catAsset,
      unitId: ids.par,
    });
    expect(res.statusCode).toBe(422);
    const manufacturer = await create(operator, 'manufacturers', { name: 'Acme consumibles' });
    const model = await operator.post(`${base}/models`, {
      name: 'M1',
      manufacturerId: manufacturer.id,
      categoryId: ids.catConsumable,
    });
    expect(model.statusCode).toBe(422);
    const cats = (await reader.get(`${base}/categories?scope=consumable`)).json().data as Json[];
    expect(cats.map((x) => x.name)).toContain('EPP');
    expect(cats.every((x) => x.scope === 'consumable')).toBe(true);
    expect(cats.map((x) => x.name)).not.toContain('Sensores');
    expect(cats[0]!.scope).toBe('consumable');
  });

  it('el nombre es único sin distinguir mayúsculas', async () => {
    const c = await newConsumable();
    const dup = await operator.post(`${base}/consumables`, {
      name: c.name.toUpperCase(),
      categoryId: ids.catConsumable,
      unitId: ids.par,
    });
    expect(dup.statusCode).toBe(409);
  });

  it('los mínimos por bodega solo aceptan bodegas y respetan los decimales de la unidad', async () => {
    const onSite = await operator.post(`${base}/consumables`, {
      name: 'Con mínimo en obra',
      categoryId: ids.catConsumable,
      unitId: ids.par,
      warehouseMinimums: [{ locationId: ids.site, minQuantity: '2' }],
    });
    expect(onSite.statusCode).toBe(422);
    const decimals = await operator.post(`${base}/consumables`, {
      name: 'Con mínimo decimal',
      categoryId: ids.catConsumable,
      unitId: ids.par,
      minStock: '2.5',
    });
    expect(decimals.statusCode).toBe(422);
    const ok = await newConsumable({
      warehouseMinimums: [
        { locationId: ids.main, minQuantity: '5' },
        { locationId: ids.annex, minQuantity: '2' },
      ],
    });
    const detail = (await reader.get(`${base}/consumables/${ok.id}`)).json();
    expect(
      Object.fromEntries(
        detail.stockByWarehouse.map((s: Json) => [s.location.name, s.minQuantity]),
      ),
    ).toEqual({ 'Bodega central': '5', 'Bodega anexo': '2' });
  });

  it('edita con If-Match, reemplaza los mínimos y no cambia la unidad con movimientos', async () => {
    const c = await newConsumable({
      warehouseMinimums: [{ locationId: ids.main, minQuantity: '5' }],
    });
    const noHeader = await operator.patch(`${base}/consumables/${c.id}`, { notes: 'x' });
    expect(noHeader.statusCode).toBe(428);
    const upd = await operator.patch(
      `${base}/consumables/${c.id}`,
      { notes: 'Talla M', warehouseMinimums: [{ locationId: ids.annex, minQuantity: '3' }] },
      { 'if-match': `"${c.updatedAt}"` },
    );
    expect(upd.statusCode, upd.body).toBe(200);
    const detail = (await reader.get(`${base}/consumables/${c.id}`)).json();
    expect(detail.notes).toBe('Talla M');
    expect(detail.stockByWarehouse.map((s: Json) => s.location.name)).toEqual(['Bodega anexo']);

    await receive(c.id, ids.main, '4');
    const unit = await operator.patch(
      `${base}/consumables/${c.id}`,
      { unitId: ids.unidad },
      { 'if-match': `"${upd.json().updatedAt}"` },
    );
    expect(unit.statusCode).toBe(409);
  });

  it('con movimientos no se borra, solo se desactiva (D10); sin movimientos sí se borra', async () => {
    const used = await newConsumable();
    await receive(used.id, ids.main, '1');
    expect((await operator.delete(`${base}/consumables/${used.id}`)).statusCode).toBe(409);
    const fresh = await newConsumable();
    expect((await operator.delete(`${base}/consumables/${fresh.id}`)).statusCode).toBe(204);
    expect((await reader.get(`${base}/consumables/${fresh.id}`)).statusCode).toBe(404);
  });

  it('el consumible inactivo no admite ingresos, entregas ni traslados; sí ajustes y anulaciones', async () => {
    const c = await newConsumable();
    const rec = await receive(c.id, ids.main, '10');
    const del = await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '2',
      recipientName: 'Persona Inventada',
    });
    expect(del.statusCode, del.body).toBe(201);
    const off = await operator.patch(
      `${base}/consumables/${c.id}`,
      { active: false },
      { 'if-match': `"${c.updatedAt}"` },
    );
    expect(off.statusCode, off.body).toBe(200);

    for (const [kind, body] of [
      ['receipts', { locationId: ids.main, quantity: '1' }],
      ['deliveries', { locationId: ids.main, quantity: '1', recipientName: 'Otra Persona' }],
      ['transfers', { fromLocationId: ids.main, toLocationId: ids.annex, quantity: '1' }],
    ] as const) {
      const res = await move(admin, c.id, kind, body);
      expect(res.statusCode, `${kind}: ${res.body}`).toBe(409);
      expect(res.json().detail).toContain('inactivo');
    }
    const adj = await move(admin, c.id, 'adjustments', {
      locationId: ids.main,
      direction: 'subtract',
      quantity: '1',
      reason: 'loss',
    });
    expect(adj.statusCode, adj.body).toBe(201);
    const reversal = await admin.post(
      `${base}/consumable-movements/${del.json().movements[0].id}/reversals`,
      { reason: 'La entrega se hizo por error' },
    );
    expect(reversal.statusCode, reversal.body).toBe(201);
    expect(rec.balances[0].quantity).toBe('10');
    expect((await stock(c.id))[ids.main]).toBe('9');
    const listed = (await reader.get(`${base}/consumables?active=false`)).json().data as Json[];
    expect(listed.map((x) => x.id)).toContain(c.id);
  });
});

describe('ingreso a bodega (RF-71)', () => {
  it('suma al saldo de la bodega y deja el movimiento con quién, cuándo y proveedor', async () => {
    const c = await newConsumable();
    const res = await move(operator, c.id, 'receipts', {
      locationId: ids.main,
      quantity: '24',
      supplier: 'Proveedor Ficticio SpA',
      note: 'Factura inventada 123',
      receivedOn: '2026-11-10',
    });
    expect(res.statusCode, res.body).toBe(201);
    const out = res.json();
    expect(out.balances).toEqual([{ locationId: ids.main, quantity: '24' }]);
    expect(out.movements[0]).toMatchObject({
      kind: 'receipt',
      delta: '24',
      supplier: 'Proveedor Ficticio SpA',
      note: 'Factura inventada 123',
      actor: { name: 'Olga Operadora' },
      reversible: true,
    });
    expect(out.movements[0].occurredAt.startsWith('2026-11-10')).toBe(true);
    expect((await stock(c.id))[ids.main]).toBe('24');
    expect((await reader.get(`${base}/consumables/${c.id}`)).json().totalStock).toBe('24');
  });

  it('la fecha del ingreso admite hasta 90 días atrás y nunca una futura; hoy es el 16-11-2026 (P6)', async () => {
    const c = await newConsumable();
    const on = (receivedOn: string) =>
      move(operator, c.id, 'receipts', { locationId: ids.main, quantity: '1', receivedOn });
    expect((await on('2026-08-18')).statusCode).toBe(201);
    const old = await on('2026-08-17');
    expect(old.statusCode).toBe(422);
    expect(old.json().errors.receivedOn[0]).toContain('90 días');
    const future = await on('2026-11-17');
    expect(future.statusCode).toBe(422);
    expect(future.json().errors.receivedOn[0]).toContain('futura');
    expect((await on('2026-11-16')).statusCode).toBe(201);
    expect((await stock(c.id))[ids.main]).toBe('2');
  });

  it('un ingreso de otro día lo marca como retroactivo y guarda cuándo se registró; el de hoy no (P6)', async () => {
    const c = await newConsumable();
    const past = await move(operator, c.id, 'receipts', {
      locationId: ids.main,
      quantity: '2',
      receivedOn: '2026-11-10',
    });
    expect(past.json().movements[0]).toMatchObject({ backdated: true });
    expect(past.json().movements[0].occurredAt.startsWith('2026-11-10')).toBe(true);
    expect(new Date(past.json().movements[0].registeredAt).getTime()).toBeGreaterThan(
      new Date('2026-11-10T23:59:59Z').getTime(),
    );
    const today = await move(operator, c.id, 'receipts', {
      locationId: ids.main,
      quantity: '1',
      receivedOn: '2026-11-16',
    });
    expect(today.json().movements[0].backdated).toBe(false);
    const plain = await receive(c.id, ids.main, '1');
    expect(plain.movements[0].backdated).toBe(false);
  });

  it('solo el ingreso admite otra fecha: una entrega, un traslado o un ajuste con fecha la ignoran (P6)', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '10');
    const del = await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '1',
      recipientName: 'Persona Inventada',
      receivedOn: '2026-10-01',
      occurredOn: '2026-10-01',
    });
    expect(del.statusCode, del.body).toBe(201);
    expect(del.json().movements[0].backdated).toBe(false);
    expect(del.json().movements[0].occurredAt).not.toContain('2026-10-01');
  });

  it('el ingreso audita la fecha del movimiento y cuándo se registró (P6)', async () => {
    const c = await newConsumable({ name: 'Con fecha pasada' });
    await move(operator, c.id, 'receipts', {
      locationId: ids.main,
      quantity: '2',
      receivedOn: '2026-11-10',
    });
    const res = await admin.get(`${base}/audit?entity=consumable&pageSize=100`);
    const event = (res.json().data as Json[]).find(
      (e) => e.entityId === c.id && e.action === 'consumable.receive',
    )!;
    expect(event.diff.receivedOn).toBe('2026-11-10');
    expect(event.diff.registeredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('valida bodega, decimales, cantidad y fecha', async () => {
    const c = await newConsumable();
    const cases: [Json, number][] = [
      [{ locationId: ids.site, quantity: '1' }, 422],
      [{ locationId: ids.main, quantity: '1.5' }, 422],
      [{ locationId: ids.main, quantity: '0' }, 400],
      [{ locationId: ids.main, quantity: '-2' }, 400],
      [{ locationId: ids.main, quantity: '1,5' }, 400],
      [{ locationId: ids.main, quantity: '1', receivedOn: '2099-01-01' }, 422],
      [{ locationId: ids.main, quantity: '1', receivedOn: '2020-01-01' }, 422],
      [{ locationId: '0190d1a0-0000-7000-8000-00000000dead', quantity: '1' }, 422],
    ];
    for (const [body, status] of cases) {
      const res = await move(operator, c.id, 'receipts', body);
      expect(res.statusCode, `${JSON.stringify(body)} → ${res.body}`).toBe(status);
    }
    expect((await stock(c.id))[ids.main]).toBeUndefined();
  });

  it('acepta decimales en una unidad que los permite y los normaliza', async () => {
    const c = await newConsumable({ unitId: ids.litro });
    const res = await receive(c.id, ids.main, '2.50');
    expect(res.balances[0].quantity).toBe('2.5');
    expect(
      (await move(operator, c.id, 'receipts', { locationId: ids.main, quantity: '0.0005' }))
        .statusCode,
    ).toBe(400);
  });

  it('el lector y el técnico no pueden ingresar', async () => {
    const c = await newConsumable();
    for (const who of [reader, tech]) {
      const res = await move(who, c.id, 'receipts', { locationId: ids.main, quantity: '1' });
      expect(res.statusCode).toBe(403);
    }
  });
});

describe('entrega (RF-72)', () => {
  it('descuenta de la bodega y deja el receptor, quién entregó y cuándo', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '10');
    const res = await move(tech, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '3',
      recipientUserId: techId,
      note: 'Cambio de turno',
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().balances).toEqual([{ locationId: ids.main, quantity: '7' }]);
    expect(res.json().movements[0]).toMatchObject({
      kind: 'delivery',
      delta: '-3',
      recipient: { userId: techId, name: 'Tomás Técnico', ref: null },
      actor: { name: 'Tomás Técnico' },
    });
  });

  it('acepta un receptor en texto libre con identificador opcional', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '5');
    const res = await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '1',
      recipientName: 'Persona Inventada',
      recipientRef: 'ID-000',
    });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().movements[0].recipient).toEqual({
      userId: null,
      name: 'Persona Inventada',
      ref: 'ID-000',
    });
  });

  it('exige un receptor, solo uno, y que el usuario exista', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '5');
    const cases: [Json, number][] = [
      [{ locationId: ids.main, quantity: '1' }, 400],
      [{ locationId: ids.main, quantity: '1', recipientUserId: techId, recipientName: 'X' }, 400],
      [{ locationId: ids.main, quantity: '1', recipientName: '   ' }, 400],
      [
        {
          locationId: ids.main,
          quantity: '1',
          recipientUserId: '0190d1a0-0000-7000-8000-00000000dead',
        },
        422,
      ],
    ];
    for (const [body, status] of cases) {
      const res = await move(operator, c.id, 'deliveries', body);
      expect(res.statusCode, `${JSON.stringify(body)} → ${res.body}`).toBe(status);
    }
  });

  it('no entrega más que el stock de esa bodega (aunque otra tenga)', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '2');
    await receive(c.id, ids.annex, '50');
    const res = await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '3',
      recipientName: 'Persona Inventada',
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().detail).toContain('Bodega central');
    expect(res.json().detail).toContain('2 pares');
    expect(await stock(c.id)).toEqual({ [ids.main]: '2', [ids.annex]: '50' });
  });
});

describe('traslado entre bodegas (D8)', () => {
  it('mueve de una bodega a otra en un solo paso, con las dos filas ligadas', async () => {
    const c = await newConsumable({ unitId: ids.litro });
    await receive(c.id, ids.main, '10');
    const res = await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '2.5',
      note: 'Reposición',
    });
    expect(res.statusCode, res.body).toBe(201);
    const [out, inn] = res.json().movements as [Json, Json];
    expect(out).toMatchObject({ kind: 'transfer_out', delta: '-2.5', location: { id: ids.main } });
    expect(inn).toMatchObject({ kind: 'transfer_in', delta: '2.5', location: { id: ids.annex } });
    expect(out.counterpartLocation.id).toBe(ids.annex);
    expect(inn.counterpartLocation.id).toBe(ids.main);
    expect(await stock(c.id)).toEqual({ [ids.main]: '7.5', [ids.annex]: '2.5' });
    expect((await reader.get(`${base}/consumables/${c.id}`)).json().totalStock).toBe('10');
  });

  it('origen distinto de destino, ambas bodegas y sin superar el origen; si falla no queda nada', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '4');
    const same = await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.main,
      quantity: '1',
    });
    expect(same.statusCode).toBe(400);
    const toSite = await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.site,
      quantity: '1',
    });
    expect(toSite.statusCode).toBe(422);
    const tooMuch = await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '5',
    });
    expect(tooMuch.statusCode).toBe(409);
    expect(await stock(c.id)).toEqual({ [ids.main]: '4' });
    const moves = (await reader.get(`${base}/consumables/${c.id}/movements`)).json();
    expect(moves.meta.total).toBe(1);
  });

  it('el técnico no puede trasladar', async () => {
    const c = await newConsumable();
    const res = await move(tech, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '1',
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('devolución (P1)', () => {
  const giveBack = (c: TestClient, deliveryId: string, body: Json) =>
    c.post(`${base}/consumable-movements/${deliveryId}/returns`, body);
  const reverseMov = (c: TestClient, id: string, reason = 'Registrada por error') =>
    c.post(`${base}/consumable-movements/${id}/reversals`, { reason });
  /** Consumible con 10 en la central y una entrega de 4 a un usuario del sistema. */
  async function delivered(extra: Json = {}) {
    const c = await newConsumable(extra);
    await receive(c.id, ids.main, '10');
    const del = await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '4',
      recipientUserId: techId,
    });
    return { c, delId: del.json().movements[0].id as string };
  }
  const history = async (id: string) =>
    (await reader.get(`${base}/consumables/${id}/movements?pageSize=100`)).json().data as Json[];

  it('entra a la bodega de la entrega, hereda el receptor y deja el vínculo y lo devuelto', async () => {
    const { c, delId } = await delivered();
    const res = await giveBack(tech, delId, { quantity: '1', note: 'Talla equivocada' });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().balances).toEqual([{ locationId: ids.main, quantity: '7' }]);
    expect(res.json().movements[0]).toMatchObject({
      kind: 'return',
      delta: '1',
      note: 'Talla equivocada',
      recipient: { userId: techId, name: 'Tomás Técnico' },
      returnOf: { id: delId },
      reversible: true,
      actor: { name: 'Tomás Técnico' },
    });
    const del = (await history(c.id)).find((m) => m.id === delId)!;
    expect(del).toMatchObject({ returned: '1', returnable: true, reversible: false });
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });

  it('se puede devolver a otra bodega activa; no a una que no es bodega', async () => {
    const { c, delId } = await delivered();
    expect(
      (await giveBack(operator, delId, { quantity: '1', locationId: ids.site })).statusCode,
    ).toBe(422);
    const ok = await giveBack(operator, delId, { quantity: '2', locationId: ids.annex });
    expect(ok.statusCode, ok.body).toBe(201);
    expect(await stock(c.id)).toEqual({ [ids.main]: '6', [ids.annex]: '2' });
  });

  it('no devuelve más de lo entregado menos lo ya devuelto, y nunca cero', async () => {
    const { c, delId } = await delivered();
    expect((await giveBack(operator, delId, { quantity: '0' })).statusCode).toBe(400);
    expect((await giveBack(operator, delId, { quantity: '5' })).statusCode).toBe(409);
    expect((await giveBack(operator, delId, { quantity: '3' })).statusCode).toBe(201);
    const over = await giveBack(operator, delId, { quantity: '2' });
    expect(over.statusCode).toBe(409);
    expect(over.json().detail).toContain('solo quedan por devolver 1');
    expect((await giveBack(operator, delId, { quantity: '1' })).statusCode).toBe(201);
    const del = (await history(c.id)).find((m) => m.id === delId)!;
    expect(del).toMatchObject({ returned: '4', returnable: false });
    expect(await stock(c.id)).toEqual({ [ids.main]: '10' });
  });

  it('solo se devuelve una entrega: no un ingreso ni una entrega anulada; respeta los decimales de la unidad', async () => {
    const { c, delId } = await delivered();
    const rec = await receive(c.id, ids.main, '1');
    expect((await giveBack(operator, rec.movements[0].id, { quantity: '1' })).statusCode).toBe(409);
    expect((await giveBack(operator, delId, { quantity: '0.5' })).statusCode).toBe(422);
    await reverseMov(admin, delId, 'Entrega duplicada');
    const res = await giveBack(operator, delId, { quantity: '1' });
    expect(res.statusCode).toBe(409);
    expect(res.json().detail).toContain('anulada');
    expect(
      (await giveBack(operator, '00000000-0000-4000-8000-000000000000', { quantity: '1' }))
        .statusCode,
    ).toBe(404);
  });

  it('una entrega con devoluciones vigentes no se anula; primero se anulan las devoluciones', async () => {
    const { c, delId } = await delivered();
    const ret = await giveBack(operator, delId, { quantity: '2' });
    const retId = ret.json().movements[0].id as string;
    const blocked = await reverseMov(admin, delId);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().detail).toContain('devoluciones vigentes');
    const undone = await reverseMov(admin, retId, 'Se devolvió otra cosa');
    expect(undone.statusCode, undone.body).toBe(201);
    expect(undone.json().movements[0]).toMatchObject({ kind: 'reversal', delta: '-2' });
    expect(await stock(c.id)).toEqual({ [ids.main]: '6' });
    const del = (await history(c.id)).find((m) => m.id === delId)!;
    expect(del).toMatchObject({ returned: '0', returnable: true, reversible: true });
    expect((await reverseMov(admin, delId)).statusCode).toBe(201);
    expect(await stock(c.id)).toEqual({ [ids.main]: '10' });
  });

  it('una devolución anulada libera la cantidad para devolverla de nuevo', async () => {
    const { delId } = await delivered();
    const first = await giveBack(operator, delId, { quantity: '4' });
    await reverseMov(admin, first.json().movements[0].id);
    expect((await giveBack(operator, delId, { quantity: '4' })).statusCode).toBe(201);
  });

  it('anular una devolución no puede dejar el saldo negativo', async () => {
    const { c, delId } = await delivered();
    const ret = await giveBack(operator, delId, { quantity: '4' });
    await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '10',
      recipientName: 'Persona Inventada',
    });
    const res = await reverseMov(admin, ret.json().movements[0].id);
    expect(res.statusCode).toBe(409);
    expect(res.json().detail).toContain('negativo');
  });

  it('exige consumables:deliver y el consumible activo; el lector no devuelve', async () => {
    const { c, delId } = await delivered();
    expect((await giveBack(reader, delId, { quantity: '1' })).statusCode).toBe(403);
    await operator.patch(
      `${base}/consumables/${c.id}`,
      { active: false },
      { 'if-match': `"${(await admin.get(`${base}/consumables/${c.id}`)).json().updatedAt}"` },
    );
    expect((await giveBack(operator, delId, { quantity: '1' })).statusCode).toBe(409);
  });

  it('devoluciones simultáneas de la misma entrega no devuelven más de lo entregado', async () => {
    const { c, delId } = await delivered();
    const clients = Array.from({ length: 6 }, (_, i) => env.client(`10.9.0.${i + 1}`));
    await Promise.all(clients.map((x) => x.login('op@ejemplo.cl')));
    const results = await Promise.all(
      clients.map((x, i) =>
        giveBack(x, delId, { quantity: '1', locationId: i % 2 ? ids.main : ids.annex }),
      ),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(4);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(2);
    const del = (await history(c.id)).find((m) => m.id === delId)!;
    expect(del.returned).toBe('4');
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });

  it('la base rechaza una devolución sin entrega o con signo negativo', async () => {
    const { c } = await delivered();
    const pool = env.db.migratorPool;
    const insert = (delta: string, returnsId: string | null) =>
      pool.query(
        `INSERT INTO consumable_movements (consumable_id, location_id, kind, delta, actor_id, recipient_name, returns_id)
         VALUES ($1, $2, 'return', $3, (SELECT id FROM users LIMIT 1), 'Persona Inventada', $4)`,
        [c.id, ids.main, delta, returnsId],
      );
    await expect(insert('1', null)).rejects.toThrow(/consumable_movements_return_chk/);
    const [d] = (
      await pool.query(
        `SELECT id FROM consumable_movements WHERE kind = 'delivery' AND consumable_id = $1`,
        [c.id],
      )
    ).rows;
    await expect(insert('-1', d.id)).rejects.toThrow(/consumable_movements_sign_chk/);
  });
});

describe('ajuste (D6)', () => {
  it('es del Administrador y del Operador (consumables:adjust); el técnico y el lector no (P2)', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '5');
    const body = {
      locationId: ids.main,
      direction: 'add',
      quantity: '1',
      reason: 'physical_count',
    };
    for (const who of [tech, reader]) {
      expect((await move(who, c.id, 'adjustments', body)).statusCode).toBe(403);
    }
    expect((await move(operator, c.id, 'adjustments', body)).statusCode).toBe(201);
    const ok = await move(admin, c.id, 'adjustments', body);
    expect(ok.statusCode, ok.body).toBe(201);
    expect(ok.json().movements[0]).toMatchObject({
      kind: 'adjustment',
      delta: '1',
      reason: 'physical_count',
    });
    expect((await stock(c.id))[ids.main]).toBe('7');
  });

  it('el motivo es obligatorio y «otro» exige nota', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '5');
    const base_ = { locationId: ids.main, direction: 'subtract', quantity: '1' };
    expect((await move(admin, c.id, 'adjustments', base_)).statusCode).toBe(400);
    expect((await move(admin, c.id, 'adjustments', { ...base_, reason: 'other' })).statusCode).toBe(
      400,
    );
    expect(
      (await move(admin, c.id, 'adjustments', { ...base_, reason: 'other', note: 'Se mojó' }))
        .statusCode,
    ).toBe(201);
  });

  it('no puede dejar el stock negativo', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '2');
    const res = await move(admin, c.id, 'adjustments', {
      locationId: ids.main,
      direction: 'subtract',
      quantity: '3',
      reason: 'loss',
    });
    expect(res.statusCode).toBe(409);
    expect((await stock(c.id))[ids.main]).toBe('2');
  });
});

describe('anulación (D7)', () => {
  const reverse = (c: TestClient, movementId: string, reason = 'Registrado por error') =>
    c.post(`${base}/consumable-movements/${movementId}/reversals`, { reason });

  it('solo con consumables:reverse (Administrador) y con motivo obligatorio', async () => {
    const c = await newConsumable();
    const rec = await receive(c.id, ids.main, '5');
    const id = rec.movements[0].id;
    for (const who of [operator, tech, reader]) {
      expect((await reverse(who, id)).statusCode).toBe(403);
    }
    expect((await admin.post(`${base}/consumable-movements/${id}/reversals`, {})).statusCode).toBe(
      400,
    );
    expect((await reverse(admin, id, '   ')).statusCode).toBe(400);
  });

  it('crea el movimiento inverso ligado al original y devuelve el stock', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '10');
    const del = await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '4',
      recipientName: 'Persona Inventada',
    });
    const delId = del.json().movements[0].id;
    const res = await reverse(admin, delId, 'Entrega duplicada');
    expect(res.statusCode, res.body).toBe(201);
    const rev = res.json().movements[0];
    expect(rev).toMatchObject({
      kind: 'reversal',
      delta: '4',
      note: 'Entrega duplicada',
      reverses: { id: delId, kind: 'delivery' },
      reversible: false,
      actor: { name: 'Ada Admin' },
    });
    expect(await stock(c.id)).toEqual({ [ids.main]: '10' });

    const history = (await reader.get(`${base}/consumables/${c.id}/movements`)).json()
      .data as Json[];
    const original = history.find((m) => m.id === delId)!;
    expect(original.reversedBy.id).toBe(rev.id);
    expect(original.reversible).toBe(false);
  });

  it('un movimiento se anula una sola vez y una anulación no se anula', async () => {
    const c = await newConsumable();
    const rec = await receive(c.id, ids.main, '10');
    const first = await reverse(admin, rec.movements[0].id);
    expect(first.statusCode, first.body).toBe(201);
    const again = await reverse(admin, rec.movements[0].id);
    expect(again.statusCode).toBe(409);
    expect(again.json().detail).toContain('ya fue anulado');
    const ofReversal = await reverse(admin, first.json().movements[0].id);
    expect(ofReversal.statusCode).toBe(409);
    expect(ofReversal.json().detail).toContain('anulación');
    expect(await stock(c.id)).toEqual({ [ids.main]: '0' });
  });

  it('rechaza anular un ingreso cuyo stock ya se entregó', async () => {
    const c = await newConsumable();
    const rec = await receive(c.id, ids.main, '5');
    await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '4',
      recipientName: 'Persona Inventada',
    });
    const res = await reverse(admin, rec.movements[0].id);
    expect(res.statusCode).toBe(409);
    expect(res.json().detail).toContain('negativo');
    expect(await stock(c.id)).toEqual({ [ids.main]: '1' });
    const history = (await reader.get(`${base}/consumables/${c.id}/movements`)).json()
      .data as Json[];
    expect(history.filter((m) => m.kind === 'reversal')).toHaveLength(0);
  });

  it('anular un traslado revierte las dos bodegas, también desde el lado de la entrada', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '10');
    const tr = await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '6',
    });
    const [, inn] = tr.json().movements as [Json, Json];
    const res = await reverse(admin, inn.id, 'Bodega equivocada');
    expect(res.statusCode, res.body).toBe(201);
    const [back1, back2] = res.json().movements as [Json, Json];
    expect([back1.kind, back2.kind]).toEqual(['reversal', 'reversal']);
    expect(await stock(c.id)).toEqual({ [ids.main]: '10', [ids.annex]: '0' });
    const again = await reverse(admin, tr.json().movements[0].id);
    expect(again.statusCode).toBe(409);
  });

  it('anular un traslado falla si el destino ya gastó lo trasladado, sin dejar nada a medias', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '10');
    const tr = await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '6',
    });
    await move(operator, c.id, 'deliveries', {
      locationId: ids.annex,
      quantity: '5',
      recipientName: 'Persona Inventada',
    });
    const res = await reverse(admin, tr.json().movements[0].id);
    expect(res.statusCode).toBe(409);
    expect(await stock(c.id)).toEqual({ [ids.main]: '4', [ids.annex]: '1' });
  });

  it('anular un ajuste revierte su efecto', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '5');
    const adj = await move(admin, c.id, 'adjustments', {
      locationId: ids.main,
      direction: 'subtract',
      quantity: '2',
      reason: 'waste_damage',
    });
    const res = await reverse(admin, adj.json().movements[0].id);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().movements[0].delta).toBe('2');
    expect(await stock(c.id)).toEqual({ [ids.main]: '5' });
  });
});

describe('permisos separados: ajustar y anular (P2, cierra Q60)', () => {
  let onlyAdjust: TestClient;
  let onlyReverse: TestClient;
  beforeAll(async () => {
    const actor = { actorId: null, ip: null };
    for (const [name, permissions, email, ip] of [
      ['Solo ajusta', ['consumables:read', 'consumables:adjust'], 'ajusta@ejemplo.cl', '10.30.0.1'],
      ['Solo anula', ['consumables:read', 'consumables:reverse'], 'anula@ejemplo.cl', '10.30.0.2'],
    ] as const) {
      await env.services.rbac.createRole(actor, {
        name,
        description: 'Rol de prueba',
        permissions: [...permissions],
      });
      await env.createUser({ email, role: name });
      const c = env.client(ip);
      await c.login(email);
      if (name === 'Solo ajusta') onlyAdjust = c;
      else onlyReverse = c;
    }
  });

  it('quien solo ajusta no anula, y quien solo anula no ajusta', async () => {
    const c = await newConsumable();
    const rec = await receive(c.id, ids.main, '5');
    const adjustBody = { locationId: ids.main, direction: 'add', quantity: '1', reason: 'loss' };
    expect((await move(onlyAdjust, c.id, 'adjustments', adjustBody)).statusCode).toBe(201);
    expect((await move(onlyReverse, c.id, 'adjustments', adjustBody)).statusCode).toBe(403);
    const reverse = (who: TestClient) =>
      who.post(`${base}/consumable-movements/${rec.movements[0].id}/reversals`, {
        reason: 'Error',
      });
    expect((await reverse(onlyAdjust)).statusCode).toBe(403);
    expect((await reverse(onlyReverse)).statusCode).toBe(201);
  });

  it('el Administrador conserva ambos y el Operador ajusta pero no anula', async () => {
    const me = async (who: TestClient) => (await who.get(`${base}/auth/me`)).json().permissions;
    expect(await me(admin)).toEqual(
      expect.arrayContaining(['consumables:adjust', 'consumables:reverse']),
    );
    const op = await me(operator);
    expect(op).toContain('consumables:adjust');
    expect(op).not.toContain('consumables:reverse');
  });
});

describe('bodega inactiva con stock (P7)', () => {
  /** Bodega propia con 10 unidades de un consumible; se desactiva al final de la preparación. */
  async function inactiveWithStock() {
    const c = await newConsumable();
    const wh = (
      await create(operator, 'locations', { name: `Bodega por cerrar ${seq}`, type: 'warehouse' })
    ).id as string;
    await receive(c.id, wh, '10');
    const loc = (await operator.get(`${base}/locations/${wh}`)).json();
    const off = await operator.patch(
      `${base}/locations/${wh}`,
      { active: false },
      { 'if-match': `"${loc.updatedAt}"` },
    );
    expect(off.statusCode, off.body).toBe(200);
    return { c, wh };
  }

  it('permite las salidas para poder vaciarla: entrega, traslado de salida y ajuste negativo', async () => {
    const { c, wh } = await inactiveWithStock();
    const del = await move(operator, c.id, 'deliveries', {
      locationId: wh,
      quantity: '2',
      recipientName: 'Persona Inventada',
    });
    expect(del.statusCode, del.body).toBe(201);
    const out = await move(operator, c.id, 'transfers', {
      fromLocationId: wh,
      toLocationId: ids.main,
      quantity: '3',
    });
    expect(out.statusCode, out.body).toBe(201);
    const adj = await move(operator, c.id, 'adjustments', {
      locationId: wh,
      direction: 'subtract',
      quantity: '5',
      reason: 'loss',
    });
    expect(adj.statusCode, adj.body).toBe(201);
    expect((await stock(c.id))[wh]).toBe('0');
  });

  it('bloquea las entradas: ingreso, traslado de entrada, devolución hacia ella y ajuste positivo', async () => {
    const { c, wh } = await inactiveWithStock();
    const blocked = (res: { statusCode: number; json(): Json }) => {
      expect(res.statusCode).toBe(422);
      expect(JSON.stringify(res.json())).toContain('inactiva');
    };
    blocked(await move(operator, c.id, 'receipts', { locationId: wh, quantity: '1' }));
    await receive(c.id, ids.main, '5');
    blocked(
      await move(operator, c.id, 'transfers', {
        fromLocationId: ids.main,
        toLocationId: wh,
        quantity: '1',
      }),
    );
    blocked(
      await move(operator, c.id, 'adjustments', {
        locationId: wh,
        direction: 'add',
        quantity: '1',
        reason: 'physical_count',
      }),
    );
    // La devolución a la bodega inactiva falla; a otra bodega activa, no.
    const del = await move(operator, c.id, 'deliveries', {
      locationId: wh,
      quantity: '2',
      recipientName: 'Persona Inventada',
    });
    const delId = del.json().movements[0].id as string;
    const back = (body: Json) =>
      operator.post(`${base}/consumable-movements/${delId}/returns`, { quantity: '1', ...body });
    blocked(await back({}));
    expect((await back({ locationId: ids.main })).statusCode).toBe(201);
    expect((await stock(c.id))[wh]).toBe('8');
  });

  it('la ubicación informa cuántos consumibles tienen stock en ella, para avisar al desactivarla', async () => {
    const a = await newConsumable();
    const b = await newConsumable();
    const wh = (await create(operator, 'locations', { name: 'Bodega con dos', type: 'warehouse' }))
      .id as string;
    expect((await operator.get(`${base}/locations/${wh}`)).json().stockedConsumables).toBe(0);
    await receive(a.id, wh, '2');
    await receive(b.id, wh, '1');
    expect((await operator.get(`${base}/locations/${wh}`)).json().stockedConsumables).toBe(2);
    // Con saldo 0 ya no cuenta.
    await move(operator, b.id, 'adjustments', {
      locationId: wh,
      direction: 'subtract',
      quantity: '1',
      reason: 'loss',
    });
    const list = (await operator.get(`${base}/locations?type=warehouse&pageSize=100`)).json()
      .data as Json[];
    expect(list.find((l) => l.id === wh)!.stockedConsumables).toBe(1);
    const site = (await operator.get(`${base}/locations/${ids.site}`)).json();
    expect(site.stockedConsumables).toBe(0);
  });
});

describe('stock mínimo (RF-74, D9)', () => {
  it('el mínimo global se compara con el total de todas las bodegas', async () => {
    const c = await newConsumable({ minStock: '10' });
    await receive(c.id, ids.main, '6');
    let d = (await reader.get(`${base}/consumables/${c.id}`)).json();
    expect(d).toMatchObject({ belowMinimum: true, lowStock: true, warehousesBelowMinimum: 0 });
    await receive(c.id, ids.annex, '4');
    d = (await reader.get(`${base}/consumables/${c.id}`)).json();
    expect(d).toMatchObject({ totalStock: '10', belowMinimum: false, lowStock: false });
  });

  it('el mínimo de una bodega se compara con el saldo de esa bodega', async () => {
    const c = await newConsumable({
      warehouseMinimums: [{ locationId: ids.main, minQuantity: '5' }],
    });
    await receive(c.id, ids.annex, '100');
    let d = (await reader.get(`${base}/consumables/${c.id}`)).json();
    expect(d).toMatchObject({ lowStock: true, warehousesBelowMinimum: 1, belowMinimum: false });
    expect(d.stockByWarehouse.find((s: Json) => s.location.id === ids.main).belowMinimum).toBe(
      true,
    );
    await receive(c.id, ids.main, '5');
    d = (await reader.get(`${base}/consumables/${c.id}`)).json();
    expect(d.lowStock).toBe(false);
  });

  it('el filtro «bajo mínimo» y el contador salen del listado; los inactivos no avisan', async () => {
    const low = await newConsumable({ name: 'Bajo mínimo A', minStock: '50' });
    const fine = await newConsumable({ name: 'Con stock A', minStock: '1' });
    await receive(fine.id, ids.main, '5');
    const none = await newConsumable({ name: 'Sin mínimo A' });
    const res = (await reader.get(`${base}/consumables?lowStock=true&pageSize=100`)).json();
    const names = (res.data as Json[]).map((x) => x.name);
    expect(names).toContain(low.name);
    expect(names).not.toContain(fine.name);
    expect(names).not.toContain(none.name);
    const before = res.meta.total;
    await operator.patch(
      `${base}/consumables/${low.id}`,
      { active: false },
      { 'if-match': `"${low.updatedAt}"` },
    );
    const after = (await reader.get(`${base}/consumables?lowStock=true&pageSize=1`)).json();
    expect(after.meta.total).toBe(before - 1);
  });
});

describe('traslado como una sola entrada del historial (P8)', () => {
  const history = async (id: string, qs = '') =>
    (
      await reader.get(
        `${base}/consumables/${id}/movements?${qs.includes('pageSize') ? qs.slice(1) : `pageSize=100${qs}`}`,
      )
    ).json();

  it('un traslado es una entrada (origen → destino) aunque el libro tenga dos filas', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '10');
    const tr = await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '4',
    });
    // El resultado de registrarlo sigue trayendo las dos filas del libro…
    expect(tr.json().movements).toHaveLength(2);
    // …pero el historial muestra una sola.
    const h = await history(c.id);
    expect(h.meta.total).toBe(2);
    const entries = (h.data as Json[]).filter((m) => m.kind.startsWith('transfer'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'transfer_out',
      delta: '-4',
      location: { id: ids.main },
      counterpartLocation: { id: ids.annex },
      reversible: true,
    });
    // El libro sí tiene las dos filas.
    const rows = await env.db.migratorPool.query(
      `SELECT 1 FROM consumable_movements WHERE consumable_id = $1 AND kind LIKE 'transfer%'`,
      [c.id],
    );
    expect(rows.rowCount).toBe(2);
  });

  it('el filtro por bodega la muestra en ambas bodegas y el de tipo «traslado» la encuentra', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '10');
    await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '4',
    });
    const transfers = (qs: string) =>
      history(c.id, qs).then((h) =>
        (h.data as Json[]).filter((m) => m.kind.startsWith('transfer')),
      );
    expect(await transfers(`&locationId=${ids.main}`)).toHaveLength(1);
    expect(await transfers(`&locationId=${ids.annex}`)).toHaveLength(1);
    expect(await transfers(`&locationId=${ids.site}`)).toHaveLength(0);
    expect((await history(c.id, '&kind=transfer')).meta.total).toBe(1);
    expect((await history(c.id, `&kind=transfer&locationId=${ids.annex}`)).meta.total).toBe(1);
    // El filtro de bodega suma los ingresos de esa bodega y el traslado.
    expect((await history(c.id, `&locationId=${ids.main}`)).meta.total).toBe(2);
    expect((await history(c.id, `&locationId=${ids.annex}`)).meta.total).toBe(1);
  });

  it('anular el traslado es una sola entrada, enlazada con el traslado, y con un solo botón', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '10');
    const tr = await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '4',
    });
    const inLeg = tr.json().movements[1].id as string;
    const undo = await admin.post(`${base}/consumable-movements/${inLeg}/reversals`, {
      reason: 'Se equivocó de bodega',
    });
    expect(undo.statusCode, undo.body).toBe(201);
    const h = await history(c.id);
    const entries = h.data as Json[];
    // ingreso + traslado + anulación del traslado.
    expect(h.meta.total).toBe(3);
    const original = entries.find((m) => m.kind === 'transfer_out')!;
    const reversal = entries.find((m) => m.kind === 'reversal')!;
    expect(original).toMatchObject({ reversible: false, reversedBy: { id: reversal.id } });
    expect(reversal).toMatchObject({
      delta: '4',
      reverses: { id: original.id, kind: 'transfer_out' },
      counterpartLocation: { id: ids.annex },
      location: { id: ids.main },
      reversible: false,
    });
    expect(
      (await history(c.id, `&locationId=${ids.annex}`)).data.filter(
        (m: Json) => m.kind === 'reversal',
      ),
    ).toHaveLength(1);
  });

  it('pagina por entradas: un traslado cuenta una vez', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '30');
    for (let i = 0; i < 3; i++) {
      await move(operator, c.id, 'transfers', {
        fromLocationId: ids.main,
        toLocationId: ids.annex,
        quantity: '1',
      });
    }
    const page1 = await history(c.id, '&pageSize=2');
    expect(page1.meta.total).toBe(4);
    expect(page1.data).toHaveLength(2);
    expect((await history(c.id, '&pageSize=2&page=2')).data).toHaveLength(2);
  });
});

describe('últimos movimientos de todos los consumibles, para Inicio (P10)', () => {
  const recent = (c: TestClient, qs = '') => c.get(`${base}/consumable-movements/recent${qs}`);

  it('trae los más recientes de todos los consumibles con su nombre y unidad, un traslado una sola vez', async () => {
    const a = await newConsumable({ name: 'Recientes A' });
    const b = await newConsumable({ name: 'Recientes B', unitId: ids.litro });
    await receive(a.id, ids.main, '10');
    await move(operator, a.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '2',
    });
    await receive(b.id, ids.main, '2.5');
    const res = await recent(reader, '?limit=3');
    expect(res.statusCode, res.body).toBe(200);
    const rows = res.json() as Json[];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      consumable: { name: 'Recientes B', unit: { abbreviation: 'L' } },
      movement: { kind: 'receipt', delta: '2.5' },
    });
    // El traslado de A cuenta como una sola entrada y viene con su bodega de destino.
    expect(rows[1]!.movement).toMatchObject({
      kind: 'transfer_out',
      counterpartLocation: { id: ids.annex },
    });
    expect(rows[1]!.consumable.name).toBe('Recientes A');
    expect(rows[2]!.movement.kind).toBe('receipt');
    const times = rows.map((r) => new Date(r.movement.occurredAt).getTime());
    expect([...times].sort((x, y) => y - x)).toEqual(times);
  });

  it('ordena por cuándo se registró: un ingreso con fecha pasada recién cargado sigue arriba', async () => {
    const c = await newConsumable({ name: 'Recientes C' });
    await receive(c.id, ids.main, '1');
    await move(operator, c.id, 'receipts', {
      locationId: ids.main,
      quantity: '2',
      receivedOn: '2026-10-01',
    });
    const rows = (await recent(reader, '?limit=1')).json() as Json[];
    expect(rows[0]!.movement).toMatchObject({ delta: '2', backdated: true });
  });

  it('exige consumables:read y acota el límite', async () => {
    const actor = { actorId: null, ip: null };
    await env.services.rbac.createRole(actor, {
      name: 'Solo activos P10',
      description: 'Rol de prueba',
      permissions: ['asset:read'],
    });
    await env.createUser({ email: 'solo-activos@ejemplo.cl', role: 'Solo activos P10' });
    const c = env.client('10.60.0.1');
    await c.login('solo-activos@ejemplo.cl');
    expect((await recent(c)).statusCode).toBe(403);
    expect((await recent(reader, '?limit=0')).statusCode).toBe(400);
    expect((await recent(reader, '?limit=500')).statusCode).toBe(400);
    expect((await recent(tech, '?limit=1')).statusCode).toBe(200);
  });
});

describe('historial (RF-73)', () => {
  it('se filtra por bodega, tipo y fecha, y se pagina', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '10');
    await receive(c.id, ids.annex, '10');
    await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '1',
      recipientName: 'Persona Inventada',
    });
    await move(operator, c.id, 'receipts', {
      locationId: ids.main,
      quantity: '1',
      receivedOn: '2026-09-15',
    });
    const get = async (qs: string) =>
      (await reader.get(`${base}/consumables/${c.id}/movements?${qs}`)).json();
    expect((await get('')).meta.total).toBe(4);
    expect((await get(`locationId=${ids.annex}`)).meta.total).toBe(1);
    expect((await get('kind=receipt')).meta.total).toBe(3);
    expect((await get('kind=delivery')).meta.total).toBe(1);
    expect((await get('to=2026-10-01')).meta.total).toBe(1);
    expect((await get('from=2026-10-01')).meta.total).toBe(3);
    const page1 = await get('pageSize=3');
    expect(page1.data).toHaveLength(3);
    const page2 = await get('pageSize=3&page=2');
    expect(page2.data).toHaveLength(1);
    // Más reciente primero.
    expect(page1.data[0].kind).toBe('delivery');
  });
});

describe('concurrencia (D3)', () => {
  it('diez entregas simultáneas de 1 sobre un stock de 4 dejan exactamente 4 entregas y stock 0', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '4');
    const clients = Array.from({ length: 10 }, (_, i) => env.client(`10.6.0.${i + 1}`));
    await Promise.all(clients.map((x) => x.login('op@ejemplo.cl')));
    const results = await Promise.all(
      clients.map((x, i) =>
        move(x, c.id, 'deliveries', {
          locationId: ids.main,
          quantity: '1',
          recipientName: `Persona Inventada ${i}`,
        }),
      ),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((s) => s === 201)).toHaveLength(4);
    expect(codes.filter((s) => s === 409)).toHaveLength(6);
    expect(await stock(c.id)).toEqual({ [ids.main]: '0' });
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });

  it('traslados cruzados simultáneos no se bloquean entre sí y conservan el total', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '50');
    await receive(c.id, ids.annex, '50');
    const clients = Array.from({ length: 8 }, (_, i) => env.client(`10.7.0.${i + 1}`));
    await Promise.all(clients.map((x) => x.login('op@ejemplo.cl')));
    const results = await Promise.all(
      clients.map((x, i) =>
        move(x, c.id, 'transfers', {
          fromLocationId: i % 2 ? ids.main : ids.annex,
          toLocationId: i % 2 ? ids.annex : ids.main,
          quantity: '3',
        }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(201));
    const total = (await reader.get(`${base}/consumables/${c.id}`)).json().totalStock;
    expect(total).toBe('100');
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });

  it('entregas y anulaciones simultáneas sobre el mismo saldo no lo dejan negativo', async () => {
    const c = await newConsumable();
    const rec = await receive(c.id, ids.main, '3');
    const clients = Array.from({ length: 4 }, (_, i) => env.client(`10.8.0.${i + 1}`));
    await Promise.all(clients.map((x) => x.login('op@ejemplo.cl')));
    await env.client('10.8.0.9').login('admin@ejemplo.cl');
    const results = await Promise.all([
      ...clients.map((x, i) =>
        move(x, c.id, 'deliveries', {
          locationId: ids.main,
          quantity: '1',
          recipientName: `Persona Inventada ${i}`,
        }),
      ),
      admin.post(`${base}/consumable-movements/${rec.movements[0].id}/reversals`, {
        reason: 'Ingreso duplicado',
      }),
    ]);
    expect(results.every((r) => [201, 409].includes(r.statusCode))).toBe(true);
    const final = (await stock(c.id))[ids.main]!;
    expect(Number(final)).toBeGreaterThanOrEqual(0);
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });
});

describe('primer movimiento en una bodega sin fila de saldo (P5)', () => {
  /** Una bodega nueva por prueba: así ningún consumible tiene fila de saldo previa en ella. */
  async function freshWarehouse(name: string): Promise<string> {
    return (await create(operator, 'locations', { name, type: 'warehouse' })).id as string;
  }
  const rowCount = async (consumableId: string, locationId: string) =>
    (
      await env.db.migratorPool.query(
        'SELECT 1 FROM consumable_stock WHERE consumable_id = $1 AND location_id = $2',
        [consumableId, locationId],
      )
    ).rowCount;
  async function clients(prefix: string, n: number): Promise<TestClient[]> {
    const list = Array.from({ length: n }, (_, i) => env.client(`${prefix}.${i + 1}`));
    await Promise.all(list.map((x) => x.login('op@ejemplo.cl')));
    return list;
  }

  it('ingresos simultáneos al mismo (consumible, bodega) sin saldo previo suman todos y crean una sola fila', async () => {
    const c = await newConsumable();
    const wh = await freshWarehouse('Bodega P5 ingresos');
    expect(await rowCount(c.id, wh)).toBe(0);
    const results = await Promise.all(
      (await clients('10.50.0', 8)).map((x) =>
        move(x, c.id, 'receipts', { locationId: wh, quantity: '1' }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(201));
    expect((await stock(c.id))[wh]).toBe('8');
    expect(await rowCount(c.id, wh)).toBe(1);
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });

  it('traslados simultáneos hacia una bodega destino sin saldo previo llegan todos', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '20');
    const wh = await freshWarehouse('Bodega P5 destino');
    expect(await rowCount(c.id, wh)).toBe(0);
    const results = await Promise.all(
      (await clients('10.51.0', 8)).map((x) =>
        move(x, c.id, 'transfers', { fromLocationId: ids.main, toLocationId: wh, quantity: '1' }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(8).fill(201));
    const after = await stock(c.id);
    expect(after[wh]).toBe('8');
    expect(after[ids.main]).toBe('12');
    expect(await rowCount(c.id, wh)).toBe(1);
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });

  it('un ingreso y un traslado de entrada a la vez sobre la misma bodega nueva no se pisan', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '5');
    const wh = await freshWarehouse('Bodega P5 mixta');
    const [a, b, d, e] = await clients('10.52.0', 4);
    const results = await Promise.all([
      move(a!, c.id, 'receipts', { locationId: wh, quantity: '2' }),
      move(b!, c.id, 'transfers', { fromLocationId: ids.main, toLocationId: wh, quantity: '3' }),
      move(d!, c.id, 'receipts', { locationId: wh, quantity: '4' }),
      move(e!, c.id, 'transfers', { fromLocationId: ids.main, toLocationId: wh, quantity: '1' }),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201, 201]);
    expect((await stock(c.id))[wh]).toBe('10');
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });
});

describe('libro y saldo (D2)', () => {
  it('el saldo materializado es igual a la suma del libro para cada consumible y bodega', async () => {
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });

  it('detecta un saldo que no cuadra con el libro', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '5');
    await env.db.migratorPool.query(
      'UPDATE consumable_stock SET quantity = quantity + 1 WHERE consumable_id = $1',
      [c.id],
    );
    const mismatches = await env.services.consumables.verifyLedger();
    expect(mismatches).toEqual([
      { consumableId: c.id, locationId: ids.main, stock: '6', ledger: '5' },
    ]);
    await env.db.migratorPool.query(
      'UPDATE consumable_stock SET quantity = quantity - 1 WHERE consumable_id = $1',
      [c.id],
    );
    expect(await env.services.consumables.verifyLedger()).toEqual([]);
  });

  it('la base impide el saldo negativo aunque falle la regla de la app', async () => {
    const c = await newConsumable();
    await receive(c.id, ids.main, '1');
    await expect(
      env.db.migratorPool.query(
        'UPDATE consumable_stock SET quantity = -1 WHERE consumable_id = $1',
        [c.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('la app no puede editar ni borrar movimientos: el libro es append-only', async () => {
    const c = await newConsumable();
    const rec = await receive(c.id, ids.main, '1');
    const id = rec.movements[0].id;
    await expect(
      env.db.pool.query('UPDATE consumable_movements SET note = $2 WHERE id = $1', [id, 'x']),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      env.db.pool.query('DELETE FROM consumable_movements WHERE id = $1', [id]),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('el libro rechaza un movimiento anulado dos veces aunque falle la app', async () => {
    const c = await newConsumable();
    const rec = await receive(c.id, ids.main, '2');
    await admin.post(`${base}/consumable-movements/${rec.movements[0].id}/reversals`, {
      reason: 'Prueba',
    });
    await expect(
      env.db.migratorPool.query(
        `INSERT INTO consumable_movements (consumable_id, location_id, kind, delta, actor_id, note, reverses_id)
         SELECT consumable_id, location_id, 'reversal', -delta, actor_id, 'otra', id
         FROM consumable_movements WHERE id = $1`,
        [rec.movements[0].id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});

describe('auditoría (D13)', () => {
  it('cada movimiento y cambio de catálogo queda con el usuario que lo hizo', async () => {
    const c = await newConsumable({ name: 'Auditado' });
    await receive(c.id, ids.main, '5');
    await move(tech, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '1',
      recipientName: 'Persona Inventada',
    });
    const adj = await move(admin, c.id, 'adjustments', {
      locationId: ids.main,
      direction: 'add',
      quantity: '1',
      reason: 'physical_count',
    });
    await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '1',
    });
    const rev = await admin.post(
      `${base}/consumable-movements/${adj.json().movements[0].id}/reversals`,
      { reason: 'Ajuste duplicado' },
    );
    expect(rev.statusCode, rev.body).toBe(201);
    const res = await admin.get(`${base}/audit?entity=consumable&pageSize=100`);
    expect(res.statusCode, res.body).toBe(200);
    const mine = (res.json().data as Json[]).filter((e) => e.entityId === c.id);
    const byAction = Object.fromEntries(mine.map((e) => [e.action, e]));
    expect(Object.keys(byAction).sort()).toEqual([
      'consumable.adjust',
      'consumable.create',
      'consumable.deliver',
      'consumable.receive',
      'consumable.reverse',
      'consumable.transfer',
    ]);
    expect(byAction['consumable.deliver'].actorName).toBe('Tomás Técnico');
    expect(byAction['consumable.adjust'].actorName).toBe('Ada Admin');
    expect(byAction['consumable.receive'].entityLabel).toBe('Auditado');
    expect(byAction['consumable.receive'].diff).toMatchObject({
      location: 'Bodega central',
      quantity: '5',
      unit: 'par',
      stockBefore: '0',
      stockAfter: '5',
    });
    expect(byAction['consumable.reverse'].diff).toMatchObject({
      originalKind: 'adjustment',
      reversalReason: 'Ajuste duplicado',
    });
  });

  it('la anulación deja el detalle completo del movimiento anulado y los saldos antes y después (P3)', async () => {
    const c = await newConsumable({ name: 'Detalle de anulación' });
    await receive(c.id, ids.main, '10');
    const del = await move(tech, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '4',
      recipientName: 'Persona Inventada',
      recipientRef: 'ID-123',
      note: 'Cambio de turno',
    });
    const undo = (id: string, reason: string) =>
      admin.post(`${base}/consumable-movements/${id}/reversals`, { reason });
    expect((await undo(del.json().movements[0].id, 'Entrega duplicada')).statusCode).toBe(201);
    const audit = async () =>
      ((await admin.get(`${base}/audit?entity=consumable&pageSize=100`)).json().data as Json[])
        .filter((e) => e.entityId === c.id && e.action === 'consumable.reverse')
        .map((e) => e.diff as Json);
    const [delivery] = await audit();
    expect(delivery).toMatchObject({
      originalKind: 'delivery',
      quantity: '4',
      unit: 'par',
      location: 'Bodega central',
      stockBefore: '6',
      stockAfter: '10',
      recipient: 'Persona Inventada',
      recipientRef: 'ID-123',
      originalNote: 'Cambio de turno',
      reversalReason: 'Entrega duplicada',
      originalActor: 'Tomás Técnico',
    });
    expect(delivery!['movementDate']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(delivery!['registeredAt']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Postgres guarda el diff como jsonb y no conserva el orden de las claves: el orden de lectura lo fija la web (P11).

    const adj = await move(admin, c.id, 'adjustments', {
      locationId: ids.main,
      direction: 'subtract',
      quantity: '2',
      reason: 'loss',
      note: 'Se cayó la caja',
    });
    await undo(adj.json().movements[0].id, 'Ajuste errado');
    const tr = await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '3',
    });
    await undo(tr.json().movements[1].id, 'Traslado al lugar equivocado');
    const all = await audit();
    expect(all.find((d) => d['originalKind'] === 'adjustment')).toMatchObject({
      quantity: '2',
      stockBefore: '8',
      stockAfter: '10',
      originalReason: 'loss',
      originalNote: 'Se cayó la caja',
      reversalReason: 'Ajuste errado',
    });
    expect(all.find((d) => d['originalKind'] === 'transfer_out')).toMatchObject({
      quantity: '3',
      fromLocation: 'Bodega central',
      toLocation: 'Bodega anexo',
      fromStockBefore: '7',
      fromStockAfter: '10',
      toStockBefore: '3',
      toStockAfter: '0',
      reversalReason: 'Traslado al lugar equivocado',
      originalActor: 'Olga Operadora',
    });
  });

  it('un traslado audita el saldo antes y después de las dos bodegas, y una devolución lo devuelto (P11)', async () => {
    const c = await newConsumable({ name: 'Auditoría de traslado' });
    await receive(c.id, ids.main, '10');
    await receive(c.id, ids.annex, '1');
    await move(operator, c.id, 'transfers', {
      fromLocationId: ids.main,
      toLocationId: ids.annex,
      quantity: '4',
    });
    const del = await move(operator, c.id, 'deliveries', {
      locationId: ids.main,
      quantity: '3',
      recipientName: 'Persona Inventada',
    });
    await operator.post(`${base}/consumable-movements/${del.json().movements[0].id}/returns`, {
      quantity: '1',
    });
    const events = (
      (await admin.get(`${base}/audit?entity=consumable&pageSize=100`)).json().data as Json[]
    ).filter((e) => e.entityId === c.id);
    const by = (action: string) => events.find((e) => e.action === action)!.diff;
    expect(by('consumable.transfer')).toMatchObject({
      quantity: '4',
      unit: 'par',
      fromLocation: 'Bodega central',
      toLocation: 'Bodega anexo',
      fromStockBefore: '10',
      fromStockAfter: '6',
      toStockBefore: '1',
      toStockAfter: '5',
    });
    expect(by('consumable.return')).toMatchObject({
      quantity: '1',
      location: 'Bodega central',
      stockBefore: '3',
      stockAfter: '4',
      recipient: 'Persona Inventada',
      returned: '1 par de 3 pares',
    });
  });

  it('una anulación que falla no deja rastro; los cambios de catálogo se auditan', async () => {
    const u = await create(operator, 'measure-units', {
      name: 'bidón',
      plural: 'bidones',
      abbreviation: 'bidón',
      decimals: 0,
    });
    const res = await admin.get(`${base}/audit?entity=measure_unit&pageSize=100`);
    const actions = (res.json().data as Json[])
      .filter((e) => e.entityId === u.id)
      .map((e) => e.action);
    expect(actions).toEqual(['measure_unit.create']);
  });
});

describe('receptores', () => {
  it('quien entrega puede buscar personas del sistema por nombre', async () => {
    const res = await tech.get(`${base}/consumable-recipients?q=Tom`);
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as Json[]).map((p) => p.name)).toContain('Tomás Técnico');
    expect((await reader.get(`${base}/consumable-recipients`)).statusCode).toBe(403);
  });
});
