import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestEnv, type TestClient, type TestEnv } from '../../../test/app.js';

/**
 * RNF-06: lecturas con p95 < 300 ms con 10.000 activos. Siembra con SQL directo (rápido) y mide el listado
 * a través de Fastify (`inject`: incluye validación, permisos, SQL y serialización; excluye la red).
 */
const TOTAL = 10_000;
const SAMPLES = 60;
const BUDGET_MS = 300;

let env: TestEnv;
let reader: TestClient;
const ids: { model: string[]; status: string[]; location: string[] } = {
  model: [],
  status: [],
  location: [],
};

beforeAll(async () => {
  env = await createTestEnv();
  await env.createUser({ email: 'lector@perf.cl', role: 'Lector' });
  reader = env.client('10.3.0.1');
  await reader.login('lector@perf.cl');

  const admin = env.client('10.3.0.2');
  await env.createUser({ email: 'admin@perf.cl', role: 'Administrador' });
  await admin.login('admin@perf.cl');
  const mk = await admin.post('/api/v1/manufacturers', { name: 'Perf SpA' });
  const cat = await admin.post('/api/v1/categories', { name: 'Perf' });
  for (let i = 0; i < 8; i += 1) {
    const m = await admin.post('/api/v1/models', {
      name: `Modelo ${i}`,
      manufacturerId: mk.json().id,
      categoryId: cat.json().id,
    });
    ids.model.push(m.json().id);
  }
  for (let i = 0; i < 20; i += 1) {
    const l = await admin.post('/api/v1/locations', { name: `Sala ${i}` });
    ids.location.push(l.json().id);
  }
  const statuses = await admin.get('/api/v1/status-labels?pageSize=100');
  ids.status = statuses.json().data.map((s: { id: string }) => s.id);

  await env.db.migratorPool.query(
    `INSERT INTO assets (asset_tag, name, serial, model_id, status_id, location_id, purchase_date, purchase_cost, supplier, notes)
     SELECT 'PERF-' || lpad(g::text, 6, '0'),
            'Activo ' || g || ' ' || (ARRAY['sensor','medidor','notebook','router'])[1 + g % 4],
            'SN' || (g * 7919)::text,
            ($1::uuid[])[1 + g % cardinality($1::uuid[])],
            ($2::uuid[])[1 + g % cardinality($2::uuid[])],
            ($3::uuid[])[1 + g % cardinality($3::uuid[])],
            date '2024-01-01' + (g % 700),
            (g % 1000) * 1000 + 0.5,
            'Proveedor ' || (g % 50),
            'Notas del activo ' || g
     FROM generate_series(1, ${TOTAL}) g`,
    [ids.model, ids.status, ids.location],
  );
  await env.db.migratorPool.query('ANALYZE assets');
}, 120_000);
afterAll(async () => env.close());

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

async function measure(url: string): Promise<{ p50: number; p95: number; max: number }> {
  const times: number[] = [];
  for (let i = 0; i < SAMPLES; i += 1) {
    const t0 = performance.now();
    const res = await reader.get(url);
    times.push(performance.now() - t0);
    expect(res.statusCode, res.body).toBe(200);
  }
  times.sort((a, b) => a - b);
  return { p50: percentile(times, 50), p95: percentile(times, 95), max: times.at(-1)! };
}

describe(`listado con ${TOTAL} activos (RNF-06)`, () => {
  it('siembra el volumen esperado', async () => {
    const res = await reader.get('/api/v1/assets?pageSize=1');
    expect(res.json().meta.total).toBe(TOTAL);
  });

  const scenarios: [string, () => string][] = [
    ['página 1, orden por etiqueta', () => '/api/v1/assets?pageSize=25'],
    ['página 1 con 100 filas', () => '/api/v1/assets?pageSize=100'],
    ['página profunda (400)', () => '/api/v1/assets?pageSize=25&page=400'],
    ['búsqueda por texto', () => '/api/v1/assets?q=medidor%2077'],
    ['búsqueda por serie', () => '/api/v1/assets?q=SN791'],
    [
      'filtro por estado y ubicación',
      () => `/api/v1/assets?statusId=${ids.status[1]}&locationId=${ids.location[2]}`,
    ],
    ['orden por nombre descendente', () => '/api/v1/assets?sort=-name'],
    ['orden por modelo con filtro', () => `/api/v1/assets?sort=model&modelId=${ids.model[3]}`],
  ];

  const report: string[] = [];
  it.each(scenarios)('%s: p95 < 300 ms', async (name, url) => {
    const { p50, p95, max } = await measure(url());
    report.push(`| ${name} | ${p50.toFixed(1)} | ${p95.toFixed(1)} | ${max.toFixed(1)} |`);
    expect(p95).toBeLessThan(BUDGET_MS);
  });

  afterAll(() => {
    process.stdout.write(
      `\nRNF-06, ${TOTAL} activos, ${SAMPLES} muestras por caso (ms)\n| caso | p50 | p95 | máx |\n|---|---|---|---|\n${report.join('\n')}\n`,
    );
  });
});
