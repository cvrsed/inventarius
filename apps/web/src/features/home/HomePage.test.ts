import { flushPromises, mount } from '@vue/test-utils';
import type { DashboardSummary, Permission } from '@inventarius/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import HomePage from './HomePage.vue';

afterEach(() => vi.unstubAllGlobals());

const uuid = (n: number) => `018f0000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const summary = (over: Partial<DashboardSummary> = {}): DashboardSummary => ({
  totals: { total: 12, available: 5, assigned: 4, pendingSetup: 3 },
  byStatusKind: [
    { kind: 'deployable', count: 9 },
    { kind: 'pending', count: 3 },
    { kind: 'undeployable', count: 0 },
    { kind: 'archived', count: 0 },
  ],
  byCategory: [{ id: uuid(1), name: 'Medidores', count: 8 }],
  stockByWarehouse: [{ id: uuid(2), name: 'Bodega Norte', count: 5 }],
  overdue: {
    count: 2,
    items: [
      {
        id: uuid(3),
        assetTag: 'INV-000003',
        name: 'Sensor 3',
        assignedTo: 'Tomás',
        expectedReturnOn: '2026-11-01',
      },
    ],
  },
  recent: [
    {
      id: '9',
      at: '2026-11-16T15:00:00.000Z',
      action: 'asset.checkout',
      actorName: 'Ana',
      assetId: uuid(3),
      assetTag: 'INV-000003',
      assetName: 'Sensor 3',
    },
  ],
  mine: [],
  ...over,
});

async function mountHome(data: DashboardSummary, permissions: Permission[]) {
  const fetchMock = mockApi({
    'GET /api/v1/dashboard': () => data,
    'GET /api/health/ready': () => ({
      status: 'ok',
      checks: { database: 'up', queue: 'up' },
    }),
  });
  const global = pagePlugins();
  useAuthStore(global.plugins![0] as never).user = {
    id: uuid(99),
    email: 'a@b.cl',
    name: 'Ana',
    mustChangePassword: false,
    roles: [],
    permissions,
  };
  const w = mount(HomePage, { global });
  await flushPromises();
  return { w, fetchMock };
}
const ADMIN: Permission[] = ['asset:read', 'asset:write', 'asset:checkout', 'role:manage'];
const hrefs = (w: ReturnType<typeof mount>) => w.findAll('a').map((a) => a.attributes('href'));

describe('HomePage (RF-28)', () => {
  it('BUG: con activos existentes no muestra «Aún no hay activos»', async () => {
    const { w } = await mountHome(summary(), ADMIN);
    expect(w.text()).not.toContain('Aún no hay activos');
    expect(w.text()).toContain('Activos');
    expect(w.text()).toContain('12');
  });

  it('sin activos sí muestra el estado vacío con el botón a activos', async () => {
    const { w } = await mountHome(
      summary({
        totals: { total: 0, available: 0, assigned: 0, pendingSetup: 0 },
        byCategory: [],
        stockByWarehouse: [],
        overdue: { count: 0, items: [] },
        recent: [],
      }),
      ADMIN,
    );
    expect(w.text()).toContain('Aún no hay activos registrados');
    expect(w.text()).not.toContain('Disponibles');
  });

  it('las tarjetas muestran los cuatro totales y enlazan al listado filtrado', async () => {
    const { w } = await mountHome(summary(), ADMIN);
    for (const label of ['Pendientes de configuración', 'Disponibles', 'Asignados'])
      expect(w.text()).toContain(label);
    const links = hrefs(w);
    expect(links).toContain('/activos?statusKind=pending');
    expect(links).toContain('/activos?statusKind=deployable&assigned=no');
    expect(links).toContain('/activos?assigned=yes');
    expect(links).toContain('/activos');
  });

  it('la tarjeta de pendientes está destacada', async () => {
    const { w } = await mountHome(summary(), ADMIN);
    const pending = w.findAll('a').find((a) => a.text().includes('Pendientes de configuración'))!;
    expect(pending.classes()).toContain('border-primary');
  });

  it('barras por estado (tipo), categoría y bodega enlazan con su filtro', async () => {
    const { w } = await mountHome(summary(), ADMIN);
    const links = hrefs(w);
    expect(links).toContain('/activos?statusKind=deployable');
    expect(links).toContain(`/activos?categoryId=${uuid(1)}`);
    expect(links).toContain(`/activos?baseLocationId=${uuid(2)}&statusKind=deployable&assigned=no`);
    expect(w.findAll('[data-bar]').length).toBeGreaterThanOrEqual(6);
    const widths = w.findAll('[data-bar]').map((b) => b.attributes('style'));
    expect(widths.some((s) => s?.includes('width: 100%'))).toBe(true);
  });

  it('muestra devoluciones atrasadas con su enlace y los últimos movimientos', async () => {
    const { w } = await mountHome(summary(), ADMIN);
    expect(w.text()).toContain('Devoluciones atrasadas');
    expect(w.text()).toContain('Ver las 2 atrasadas');
    expect(w.text()).toContain('debía volver el 01-11-2026');
    expect(hrefs(w)).toContain('/activos?overdue=true');
    expect(w.text()).toContain('Últimos movimientos');
    expect(w.text()).toContain('Asignado');
    expect(w.text()).toContain('por Ana');
  });

  it('el técnico ve «Mis equipos asignados» y no los totales', async () => {
    const { w } = await mountHome(
      summary({
        mine: [
          {
            id: uuid(5),
            assetTag: 'INV-000005',
            name: 'Medidor 5',
            since: '2026-11-16T15:00:00.000Z',
            expectedReturnOn: '2026-12-01',
          },
        ],
      }),
      ['asset:read', 'asset:checkout'],
    );
    expect(w.text()).toContain('Mis equipos asignados');
    expect(w.text()).toContain('INV-000005');
    expect(w.text()).toContain('Devolver el 01-12-2026');
    expect(w.text()).not.toContain('Disponibles');
    expect(w.text()).not.toContain('Estado del sistema');
  });

  it('el técnico sin equipos ve un mensaje claro', async () => {
    const { w } = await mountHome(summary({ mine: [] }), ['asset:read', 'asset:checkout']);
    expect(w.text()).toContain('No tienes equipos asignados');
  });

  it('«Estado del sistema» es solo para administradores y va al final', async () => {
    const admin = await mountHome(summary(), ADMIN);
    expect(admin.w.text()).toContain('Estado del sistema');
    const sections = admin.w.findAll('section, h2').map((n) => n.text());
    expect(sections.at(-1)).toContain('Estado del sistema');
    const reader = await mountHome(summary(), ['asset:read']);
    expect(reader.w.text()).not.toContain('Estado del sistema');
  });

  it('pide un solo endpoint de resumen (nada de traer activos)', async () => {
    const { fetchMock } = await mountHome(summary(), ADMIN);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => u.startsWith('/api/v1/dashboard'))).toHaveLength(1);
    expect(urls.some((u) => u.startsWith('/api/v1/assets'))).toBe(false);
  });

  it('un error del servidor ofrece reintentar', async () => {
    mockApi({ 'GET /api/v1/dashboard': () => jsonResponse({ title: 'x', status: 500 }, 500) });
    const global = pagePlugins();
    useAuthStore(global.plugins![0] as never).user = {
      id: uuid(99),
      email: 'a@b.cl',
      name: 'Ana',
      mustChangePassword: false,
      roles: [],
      permissions: ['asset:read'],
    };
    const w = mount(HomePage, { global });
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Reintentar');
  });
});
