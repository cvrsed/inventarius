import { expect } from 'vitest';
import type { TestClient, TestEnv } from './app.js';

const base = '/api/v1';

/** Datos de prueba inventados: ningún identificador real. */
export const APP_KEY = 'A1B2C3D4E5F60718293A4B5C6D7E8F90';
export const NWK_KEY = '0F1E2D3C4B5A69788796A5B4C3D2E1F0';
export const JOIN_EUI = '8877665544332211';

/** DevEUI de prueba número `n` (único y válido). */
export const devEui = (n: number) => `70B3D57ED${String(n).padStart(7, '0')}`;

export interface LorawanFixture {
  admin: TestClient;
  operator: TestClient;
  tech: TestClient;
  reader: TestClient;
  ids: {
    model: string;
    plainModel: string;
    status: string;
    warehouse: string;
  };
  /** Crea un activo LoRaWAN (con serie) y devuelve su id y etiqueta. */
  newAsset(
    extra?: Record<string, unknown>,
  ): Promise<{ id: string; assetTag: string; updatedAt: string }>;
}

async function post<T = Record<string, unknown>>(c: TestClient, path: string, body: unknown) {
  const res = await c.post(`${base}/${path}`, body);
  expect(res.statusCode, res.body).toBe(201);
  return res.json() as T & { id: string };
}

/** Usuarios por rol y un catálogo mínimo con un modelo LoRaWAN con valores por defecto. */
export async function setupLorawan(env: TestEnv, ipPrefix: string): Promise<LorawanFixture> {
  await env.createUser({ email: 'admin@ejemplo.cl', role: 'Administrador' });
  await env.createUser({ email: 'op@ejemplo.cl', role: 'Operador' });
  await env.createUser({ email: 'tec@ejemplo.cl', role: 'Técnico de campo' });
  await env.createUser({ email: 'lector@ejemplo.cl', role: 'Lector' });
  const admin = env.client(`${ipPrefix}.1`);
  const operator = env.client(`${ipPrefix}.2`);
  const tech = env.client(`${ipPrefix}.3`);
  const reader = env.client(`${ipPrefix}.4`);
  await admin.login('admin@ejemplo.cl');
  await operator.login('op@ejemplo.cl');
  await tech.login('tec@ejemplo.cl');
  await reader.login('lector@ejemplo.cl');

  const manufacturer = await post(operator, 'manufacturers', { name: 'Acme IoT' });
  const lora = await post(operator, 'categories', { name: 'Sensores', extension: 'lorawan' });
  const plain = await post(operator, 'categories', { name: 'Notebooks' });
  const model = await post(operator, 'models', {
    name: 'Sensor S1',
    manufacturerId: manufacturer.id,
    categoryId: lora.id,
    lorawanClass: 'A',
    lorawanVersion: '1.0.3',
    lorawanRegion: 'AU915',
  });
  const plainModel = await post(operator, 'models', {
    name: 'Notebook N1',
    manufacturerId: manufacturer.id,
    categoryId: plain.id,
  });
  const statuses = (await admin.get(`${base}/status-labels?q=Disponible`)).json().data as {
    id: string;
    name: string;
  }[];
  const status = statuses.find((s) => s.name === 'Disponible')!.id;
  const warehouse = (await post(operator, 'locations', { name: 'Bodega', type: 'warehouse' })).id;

  let n = 0;
  return {
    admin,
    operator,
    tech,
    reader,
    ids: { model: model.id, plainModel: plainModel.id, status, warehouse },
    async newAsset(extra = {}) {
      n += 1;
      return post(operator, 'assets', {
        name: `Sensor ${n}`,
        serial: `SN-${ipPrefix}-${n}`,
        modelId: model.id,
        statusId: status,
        ...extra,
      });
    },
  };
}
