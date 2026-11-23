import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from '../../../test/app.js';

/**
 * RNF-06 para los filtros jerárquicos de ubicación: unas 500 ubicaciones en un árbol de ~6 niveles y 2.000 activos.
 * Filtrar por la raíz obliga a recorrer todo el árbol; es el peor caso de la consulta recursiva.
 */
const LOCATIONS = 500;
const ASSETS = 2_000;
const SAMPLES = 60;
const BUDGET_MS = 300;

let env: TestEnv;
let reader: TestClient;
const nodes: string[] = [];

beforeAll(async () => {
  env = await createTestEnv();
  const admin = env.client('10.5.0.1');
  await env.createUser({ email: 'admin@perf.cl', role: 'Administrador' });
  await env.createUser({ email: 'lector@perf.cl', role: 'Lector' });
  await admin.login('admin@perf.cl');
  reader = env.client('10.5.0.2');
  await reader.login('lector@perf.cl');

  const mk = await admin.post('/api/v1/manufacturers', { name: 'Perf SpA' });
  const cat = await admin.post('/api/v1/categories', { name: 'Perf' });
  const model = await admin.post('/api/v1/models', {
    name: 'Modelo perf',
    manufacturerId: mk.json().id,
    categoryId: cat.json().id,
  });
  const statuses = (await admin.get('/api/v1/status-labels?pageSize=100')).json().data as {
    id: string;
  }[];

  // Árbol ternario: el nodo i cuelga del nodo (i - 1) / 3, así que 500 nodos llegan a 6 niveles. Los 3 primeros
  // nodos (y cada 7.º) son bodegas; el resto, sitios de cliente.
  for (let i = 0; i < LOCATIONS; i += 1) nodes.push(randomUUID());
  await env.db.migratorPool.query(
    `INSERT INTO locations (id, name, parent_id, type)
     SELECT ids.id, 'Lugar ' || (g - 1),
            CASE WHEN g = 1 THEN NULL ELSE ($1::uuid[])[(g - 2) / 3 + 1] END,
            CASE WHEN g <= 3 OR g % 7 = 0 THEN 'warehouse' ELSE 'customer_site' END
     FROM generate_series(1, ${LOCATIONS}) g
     JOIN LATERAL (SELECT ($1::uuid[])[g] AS id) ids ON true
     ORDER BY g`,
    [nodes],
  );
  await env.db.migratorPool.query(
    `INSERT INTO assets (asset_tag, name, serial, model_id, status_id, location_id, base_location_id)
     SELECT 'LOC-' || lpad(g::text, 6, '0'), 'Activo ' || g, 'SNL' || g,
            $1::uuid, ($2::uuid[])[1 + g % cardinality($2::uuid[])],
            ($3::uuid[])[1 + (g * 7) % cardinality($3::uuid[])],
            ($3::uuid[])[1 + g % 3]
     FROM generate_series(1, ${ASSETS}) g`,
    [model.json().id, statuses.map((s) => s.id), nodes],
  );
  await env.db.migratorPool.query('ANALYZE locations; ANALYZE assets');
}, 120_000);
afterAll(async () => env.close());

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

describe(`filtros de ubicación con ${LOCATIONS} ubicaciones y ${ASSETS} activos (RNF-06)`, () => {
  it('siembra el volumen esperado', async () => {
    expect((await reader.get('/api/v1/assets?pageSize=1')).json().meta.total).toBe(ASSETS);
  });

  const scenarios: [string, () => string, number | null][] = [
    ['ubicación actual = raíz (todo el árbol)', () => `locationId=${nodes[0]}`, ASSETS],
    ['ubicación actual = nivel 2', () => `locationId=${nodes[1]}`, null],
    ['ubicación actual = hoja', () => `locationId=${nodes[LOCATIONS - 1]}`, null],
    ['bodega base = raíz', () => `baseLocationId=${nodes[0]}`, ASSETS],
    ['bodega base = bodega de nivel 2', () => `baseLocationId=${nodes[1]}`, null],
    [
      'ambas, ordenadas por ubicación',
      () => `locationId=${nodes[0]}&baseLocationId=${nodes[1]}&sort=location`,
      null,
    ],
  ];

  const report: string[] = [];
  it.each(scenarios)('%s: p95 < 300 ms', async (name, qs, total) => {
    const times: number[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const t0 = performance.now();
      const res = await reader.get(`/api/v1/assets?pageSize=25&${qs()}`);
      times.push(performance.now() - t0);
      expect(res.statusCode, res.body).toBe(200);
      if (total !== null && i === 0) expect(res.json().meta.total).toBe(total);
    }
    times.sort((a, b) => a - b);
    const p95 = percentile(times, 95);
    report.push(`| ${name} | ${percentile(times, 50).toFixed(1)} | ${p95.toFixed(1)} |`);
    expect(p95).toBeLessThan(BUDGET_MS);
  });

  afterAll(() => {
    process.stdout.write(
      `\nRNF-06 ubicaciones (${LOCATIONS} ubicaciones, ${ASSETS} activos, ${SAMPLES} muestras, ms)\n| caso | p50 | p95 |\n|---|---|---|\n${report.join('\n')}\n`,
    );
  });
});
