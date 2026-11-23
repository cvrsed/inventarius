import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from '../../../test/app.js';

/**
 * Filtros de ubicación del listado: «ubicación actual» (`locationId`) y «bodega base» (`baseLocationId`) incluyen todas las
 * sububicaciones, sin límite de profundidad. Árbol de 6 niveles con una rama hermana para comprobar que no se cuela nada.
 */
let env: TestEnv;
let operator: TestClient;
let reader: TestClient;
let techId: string;

const base = '/api/v1';
const loc: Record<string, string> = {};
const asset: Record<string, string> = {};

async function post<T = Record<string, unknown>>(path: string, body: unknown) {
  const res = await operator.post(`${base}/${path}`, body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as T & { id: string };
}

async function place(name: string, type: string, parent?: string) {
  loc[name] = (await post('locations', { name, type, parentId: loc[parent ?? ''] })).id;
}

async function tags(qs: string): Promise<string[]> {
  const res = await reader.get(`${base}/assets?pageSize=100&sort=assetTag&${qs}`);
  expect(res.statusCode, res.body).toBe(200);
  return (res.json().data as { name: string }[]).map((a) => a.name).sort();
}

beforeAll(async () => {
  env = await createTestEnv();
  await env.createUser({ email: 'op@ejemplo.cl', role: 'Operador' });
  techId = await env.createUser({ email: 'tec@ejemplo.cl', role: 'Técnico de campo' });
  await env.createUser({ email: 'lector@ejemplo.cl', role: 'Lector' });
  operator = env.client('10.4.0.1');
  reader = env.client('10.4.0.2');
  await operator.login('op@ejemplo.cl');
  await reader.login('lector@ejemplo.cl');

  // Chile > Cliente Norte > Edificio A > Piso 2 > Sala 201 > Rack 7   (rama hermana: Chile > Cliente Sur > Edificio S)
  await place('Chile', 'other');
  await place('Cliente Norte', 'customer_site', 'Chile');
  await place('Edificio A', 'customer_site', 'Cliente Norte');
  await place('Piso 2', 'customer_site', 'Edificio A');
  await place('Sala 201', 'customer_site', 'Piso 2');
  await place('Rack 7', 'customer_site', 'Sala 201');
  await place('Cliente Sur', 'customer_site', 'Chile');
  await place('Edificio S', 'customer_site', 'Cliente Sur');
  await place('Bodega Central', 'warehouse');
  await place('Bodega Anexo', 'warehouse', 'Bodega Central');

  const manufacturer = await post('manufacturers', { name: 'Acme' });
  const category = await post('categories', { name: 'Medidores' });
  const model = await post('models', {
    name: 'Modelo A',
    manufacturerId: manufacturer.id,
    categoryId: category.id,
  });
  const statuses = (await operator.get(`${base}/status-labels?pageSize=100`)).json().data as {
    id: string;
    name: string;
  }[];
  const available = statuses.find((s) => s.name === 'Disponible')!.id;

  const make = async (name: string, baseName: string) => {
    asset[name] = (
      await post('assets', {
        name,
        modelId: model.id,
        statusId: available,
        baseLocationId: loc[baseName],
      })
    ).id;
  };
  const install = async (name: string, site: string) => {
    const res = await operator.post(`${base}/assets/${asset[name]}/checkout`, {
      locationId: loc[site],
    });
    expect(res.statusCode, res.body).toBe(200);
  };

  await make('En central', 'Bodega Central');
  await make('En anexo', 'Bodega Anexo');
  await make('En rack', 'Bodega Anexo');
  await make('En sala', 'Bodega Central');
  await make('En sur', 'Bodega Central');
  await make('Con persona', 'Bodega Central');
  await install('En rack', 'Rack 7');
  await install('En sala', 'Sala 201');
  await install('En sur', 'Edificio S');
  const res = await operator.post(`${base}/assets/${asset['Con persona']}/checkout`, {
    userId: techId,
  });
  expect(res.statusCode, res.body).toBe(200);
}, 60_000);
afterAll(async () => env.close());

describe('filtro «ubicación actual» (locationId)', () => {
  it('un sitio de cliente profundo trae lo instalado ahí y en sus sububicaciones', async () => {
    expect(await tags(`locationId=${loc['Rack 7']}`)).toEqual(['En rack']);
    expect(await tags(`locationId=${loc['Sala 201']}`)).toEqual(['En rack', 'En sala']);
  });

  it('un nivel intermedio y un ancestro traen todo lo de abajo y nada de la rama vecina', async () => {
    const abajo = ['En rack', 'En sala'];
    expect(await tags(`locationId=${loc['Piso 2']}`)).toEqual(abajo);
    expect(await tags(`locationId=${loc['Edificio A']}`)).toEqual(abajo);
    expect(await tags(`locationId=${loc['Cliente Norte']}`)).toEqual(abajo);
    expect(await tags(`locationId=${loc['Cliente Sur']}`)).toEqual(['En sur']);
    expect(await tags(`locationId=${loc['Chile']}`)).toEqual(['En rack', 'En sala', 'En sur']);
  });

  it('una bodega incluye lo guardado en sus sububicaciones; los asignados a una persona no entran', async () => {
    expect(await tags(`locationId=${loc['Bodega Central']}`)).toEqual(['En anexo', 'En central']);
    expect(await tags(`locationId=${loc['Bodega Anexo']}`)).toEqual(['En anexo']);
    const all = await tags(`locationId=${loc['Chile']}`);
    expect(all).not.toContain('Con persona');
  });

  it('una ubicación inexistente no trae nada', async () => {
    expect(await tags('locationId=018f0000-0000-7000-8000-00000000dead')).toEqual([]);
  });

  it('con un ciclo en los datos la consulta termina y trae lo que cuelga de él', async () => {
    await place('Ciclo X', 'customer_site');
    await place('Ciclo Y', 'customer_site', 'Ciclo X');
    const res = await operator.post(`${base}/assets/${asset['En central']}/checkout`, {
      locationId: loc['Ciclo Y'],
    });
    expect(res.statusCode, res.body).toBe(200);
    // Datos dañados a propósito: la API no deja crear un ciclo.
    await env.db.migratorPool.query('UPDATE locations SET parent_id = $1 WHERE id = $2', [
      loc['Ciclo Y'],
      loc['Ciclo X'],
    ]);
    expect(await tags(`locationId=${loc['Ciclo X']}`)).toEqual(['En central']);
    expect(await tags(`locationId=${loc['Ciclo Y']}`)).toEqual(['En central']);
  }, 15_000);
});

describe('filtro «bodega base» (baseLocationId)', () => {
  it('una bodega incluye los activos de sus sububicaciones aunque estén instalados en otro lado', async () => {
    expect(await tags(`baseLocationId=${loc['Bodega Anexo']}`)).toEqual(['En anexo', 'En rack']);
    const central = await tags(`baseLocationId=${loc['Bodega Central']}`);
    expect(central).toEqual(
      ['Con persona', 'En anexo', 'En central', 'En rack', 'En sala', 'En sur'].sort(),
    );
  });

  it('se combina con la ubicación actual', async () => {
    expect(await tags(`baseLocationId=${loc['Bodega Anexo']}&locationId=${loc['Piso 2']}`)).toEqual(
      ['En rack'],
    );
  });
});

describe('exportación CSV', () => {
  it('respeta los mismos filtros de ubicación', async () => {
    const res = await reader.get(`${base}/assets/export?locationId=${loc['Cliente Sur']}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('En sur');
    expect(res.body).not.toContain('En rack');
    expect(res.body).not.toContain('En central');
  });
});
