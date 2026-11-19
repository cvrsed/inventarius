import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestEnv } from '../../../test/app.js';
import {
  APP_KEY,
  devEui,
  JOIN_EUI,
  setupLorawan,
  type LorawanFixture,
} from '../../../test/lorawan.js';

let env: TestEnv;
let fx: LorawanFixture;
const base = '/api/v1';
const HEAD = 'serial,DevEUI,JoinEUI,AppKey,NwkKey,Clase,Versión,Región';

beforeAll(async () => {
  env = await createTestEnv();
  fx = await setupLorawan(env, '10.52.0');
});
afterAll(async () => env.close());

const key = (i: number) => APP_KEY.slice(0, 28) + String(i).padStart(4, '0');
const line = (serial: string, i: number, extra = '') =>
  `${serial},${devEui(1000 + i)},${JOIN_EUI},${key(i)}${extra}`;

/** Crea N activos LoRaWAN en lote con series conocidas. */
async function batch(prefix: string, n: number) {
  const serials = Array.from(
    { length: n },
    (_, i) => `${prefix}-${String(i + 1).padStart(3, '0')}`,
  );
  const res = await fx.operator.post(`${base}/assets/batch`, {
    modelId: fx.ids.model,
    quantity: n,
    baseLocationId: fx.ids.warehouse,
    statusId: fx.ids.status,
    serials,
  });
  expect(res.statusCode, res.body).toBe(201);
  return serials;
}

describe('importación CSV de datos LoRaWAN (RF-66)', () => {
  it('100 series: la vista previa asocia cada fila a su activo y al confirmar quedan los datos correctos', async () => {
    const serials = await batch('LOT', 100);
    const csv = [HEAD, ...serials.map((s, i) => line(s, i, `,,A,1.0.3,AU915`))].join('\n');
    const preview = await fx.operator.post(`${base}/lorawan/import/preview`, { csv });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.json()).toMatchObject({ total: 100, valid: 100, invalid: 0, fileErrors: [] });
    expect(preview.body).not.toContain(key(5));

    const res = await fx.operator.post(`${base}/lorawan/import`, { csv });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ applied: 100 });

    // Cada serie quedó con su propio DevEUI y su clave.
    for (const i of [0, 49, 99]) {
      const list = (await fx.reader.get(`${base}/assets?q=${serials[i]}`)).json().data as {
        id: string;
      }[];
      const lw = (await fx.reader.get(`${base}/assets/${list[0]!.id}/lorawan`)).json();
      expect(lw).toMatchObject({
        devEui: devEui(1000 + i),
        joinEui: JOIN_EUI,
        hasAppKey: true,
        region: 'AU915',
      });
      const keys = (await fx.admin.post(`${base}/assets/${list[0]!.id}/lorawan/reveal`)).json();
      expect(keys.appKey).toBe(key(i));
    }
    // Un solo registro de auditoría del lote, sin claves.
    const { rows } = await env.db.migratorPool.query(
      "SELECT diff, entity_label FROM audit_log WHERE action = 'lorawan.import'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].diff.after.count).toBe(100);
    // Cada evento por activo referencia el id del lote (el de la entidad del registro del lote).
    const batchId = (
      await env.db.migratorPool.query(
        "SELECT entity_id FROM audit_log WHERE action = 'lorawan.import'",
      )
    ).rows[0].entity_id;
    expect(batchId).toMatch(/^[0-9a-f-]{36}$/);
    const perAsset = await env.db.migratorPool.query(
      "SELECT diff->'after'->>'batchId' AS batch_id FROM audit_log WHERE action = 'lorawan.update' AND diff->'after'->>'batchId' IS NOT NULL",
    );
    expect(perAsset.rows).toHaveLength(100);
    expect(new Set(perAsset.rows.map((r) => r.batch_id))).toEqual(new Set([batchId]));
    expect(JSON.stringify(rows[0])).not.toContain(key(7));
    const all = await env.db.migratorPool.query('SELECT diff::text AS d FROM audit_log');
    expect(all.rows.map((r) => r.d).join()).not.toContain(key(7));
  });

  it('rechaza filas inválidas con su error y no aplica nada', async () => {
    const serials = await batch('BAD', 5);
    const csv = [
      HEAD,
      line(serials[0]!, 200),
      line('NO-EXISTE', 201),
      `${serials[1]},1234,${JOIN_EUI},${key(202)}`,
      line(serials[2]!, 203, ',,,'),
      line(serials[2]!, 204),
      `${serials[3]},${devEui(1000)},${JOIN_EUI},${key(205)}`, // DevEUI de otro activo (lote anterior)
    ].join('\n');
    const preview = (await fx.operator.post(`${base}/lorawan/import/preview`, { csv })).json();
    expect(preview).toMatchObject({ total: 6, valid: 1, invalid: 5 });
    const errs = (line: number) =>
      preview.rows.find((r: { line: number }) => r.line === line).errors as string[];
    expect(errs(3)).toEqual(['Ningún activo tiene ese número de serie']);
    expect(errs(4)).toEqual(['DevEUI inválido (16 caracteres hexadecimales)']);
    expect(errs(5)).toEqual(['Número de serie repetido en el archivo']);
    expect(errs(6)).toEqual(['Número de serie repetido en el archivo']);
    expect(errs(7)[0]).toMatch(/El DevEUI ya lo usa el activo INV-/);
    expect(preview.rows[0].assetTag).toMatch(/^INV-/);

    const res = await fx.operator.post(`${base}/lorawan/import`, { csv });
    expect(res.statusCode).toBe(422);
    expect(res.json().errors.csv).toContain('5 filas con errores');
    // Ni siquiera la fila válida se aplicó.
    const first = (await fx.reader.get(`${base}/assets?q=${serials[0]}`)).json().data[0];
    expect((await fx.reader.get(`${base}/assets/${first.id}/lorawan`)).json().devEui).toBeNull();
  });

  it('rechaza activos dados de baja, de categoría sin LoRaWAN y errores de archivo', async () => {
    const plain = await fx.operator.post(`${base}/assets`, {
      name: 'NB',
      serial: 'PLAIN-1',
      modelId: fx.ids.plainModel,
      statusId: fx.ids.status,
    });
    expect(plain.statusCode).toBe(201);
    const serials = await batch('DEL', 1);
    const gone = (await fx.reader.get(`${base}/assets?q=${serials[0]}`)).json().data[0];
    await fx.operator.request({
      method: 'DELETE',
      url: `${base}/assets/${gone.id}`,
      payload: { reason: 'prueba' },
    });
    const csv = [HEAD, line('PLAIN-1', 300), line(serials[0]!, 301)].join('\n');
    const preview = (await fx.operator.post(`${base}/lorawan/import/preview`, { csv })).json();
    expect(preview.rows[0].errors).toEqual(['El modelo del activo no es de una categoría LoRaWAN']);
    expect(preview.rows[1].errors).toEqual(['El activo está dado de baja']);

    const noCols = (
      await fx.operator.post(`${base}/lorawan/import/preview`, { csv: 'serial,otro\nA,1' })
    ).json();
    expect(noCols.fileErrors[0]).toMatch(/Faltan columnas obligatorias/);
    expect(
      (await fx.operator.post(`${base}/lorawan/import`, { csv: 'serial,otro\nA,1' })).statusCode,
    ).toBe(422);
  });

  it('exige permiso de escritura de activos', async () => {
    for (const c of [fx.reader, fx.tech]) {
      expect((await c.post(`${base}/lorawan/import/preview`, { csv: HEAD })).statusCode).toBe(403);
      expect((await c.post(`${base}/lorawan/import`, { csv: HEAD })).statusCode).toBe(403);
    }
  });

  it('sin clase, versión ni región en el CSV aplica los valores por defecto del modelo, como el alta manual', async () => {
    const [serial] = await batch('DEF', 1);
    const csv = [HEAD, line(serial!, 500)].join('\n');
    const res = await fx.operator.post(`${base}/lorawan/import`, { csv });
    expect(res.statusCode, res.body).toBe(200);
    const list = (await fx.reader.get(`${base}/assets?q=${serial}`)).json().data as {
      id: string;
    }[];
    const lw = (await fx.reader.get(`${base}/assets/${list[0]!.id}/lorawan`)).json();
    expect(lw).toMatchObject({ deviceClass: 'A', lorawanVersion: '1.0.3', region: 'AU915' });
  });

  it('un activo que ya tenía datos sin clase, versión ni región los recibe del modelo; lo que ya tenía no se pisa', async () => {
    const [empty, kept] = await batch('DEF2', 2);
    const idOf = async (serial: string) =>
      ((await fx.reader.get(`${base}/assets?q=${serial}`)).json().data as { id: string }[])[0]!.id;
    // Fila existente con la clase borrada a propósito en uno y distinta del modelo en el otro.
    await fx.operator.patch(`${base}/assets/${await idOf(empty!)}/lorawan`, {
      devEui: devEui(600),
      deviceClass: null,
      lorawanVersion: null,
      region: null,
    });
    await fx.operator.patch(`${base}/assets/${await idOf(kept!)}/lorawan`, {
      devEui: devEui(601),
      deviceClass: 'C',
    });
    const csv = [HEAD, line(empty!, 600), line(kept!, 601)].join('\n');
    const res = await fx.operator.post(`${base}/lorawan/import`, { csv });
    expect(res.statusCode, res.body).toBe(200);
    const get = async (serial: string) =>
      (await fx.reader.get(`${base}/assets/${await idOf(serial)}/lorawan`)).json();
    expect(await get(empty!)).toMatchObject({
      deviceClass: 'A',
      lorawanVersion: '1.0.3',
      region: 'AU915',
    });
    expect(await get(kept!)).toMatchObject({ deviceClass: 'C', region: 'AU915' });
  });
});
