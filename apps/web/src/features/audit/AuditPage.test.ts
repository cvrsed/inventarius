import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { mockApi, pagePlugins, useMobileViewport } from '@/test-utils';
import AuditPage from './AuditPage.vue';

afterEach(() => vi.unstubAllGlobals());
beforeEach(async () => {
  await router.push('/auditoria');
});

const entry = (n: number, over: Record<string, unknown> = {}) => ({
  id: String(n),
  at: '2026-11-16T15:00:00.000Z',
  actorId: '018f0000-0000-7000-8000-000000000001',
  actorName: 'Ana',
  actorLabel: null,
  action: 'user.update',
  entity: 'user',
  entityId: '018f0000-0000-7000-8000-000000000002',
  entityLabel: 'Usuario 2',
  entityLinkable: true,
  diff: { before: { name: 'A' }, after: { name: 'B' } },
  ip: '10.0.0.1',
  ...over,
});

describe('AuditPage', () => {
  it('muestra acciones y entidades traducidas, y «Sistema» cuando no hay actor', async () => {
    mockApi({
      'GET /api/v1/audit': () => ({
        data: [
          entry(1),
          entry(2, { actorId: null, actorName: null, action: 'auth.login_failed', diff: null }),
          entry(3, { actorId: null, actorName: null, actorLabel: 'cli', action: 'user.update' }),
          entry(4, {
            actorId: null,
            actorName: null,
            actorLabel: 'worker',
            action: 'lns.registered',
          }),
        ],
        meta: { page: 1, pageSize: 25, total: 3 },
      }),
    });
    const w = mount(AuditPage, { global: pagePlugins() });
    await flushPromises();
    expect(w.text()).toContain('Edición de usuario');
    expect(w.text()).toContain('Intento de acceso fallido');
    expect(w.text()).toContain('Sistema');
    expect(w.text()).toContain('CLI (operación)');
    expect(w.text()).toContain('Ana');
    expect(w.text()).not.toContain('worker');
  });

  it('en móvil cada registro es una tarjeta cuyo detalle se abre sin scroll horizontal', async () => {
    useMobileViewport();
    mockApi({
      'GET /api/v1/audit': () => ({ data: [entry(1)], meta: { page: 1, pageSize: 25, total: 1 } }),
    });
    const w = mount(AuditPage, { global: pagePlugins() });
    await flushPromises();
    const card = w.get('ul > li');
    expect(card.text()).toContain('Edición de usuario');
    expect(card.find('dl').exists()).toBe(false);
    await card.get('button').trigger('click');
    // Campo → valor en español, nunca JSON crudo.
    expect(card.find('pre').exists()).toBe(false);
    expect(card.get('dl').text()).toContain('Nombre');
    expect(card.get('dl').text()).toContain('Antes: A');
    expect(card.get('dl').text()).toContain('Después: B');
    expect(card.text()).not.toContain('{');
  });

  it('pide los registros con los filtros de fecha convertidos a instantes', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/audit': () => ({ data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    });
    // Los filtros viven en la URL: una fecha de un enlace compartido filtra y se ve como chip.
    await router.push('/auditoria?from=2026-11-01&entity=asset');
    const w = mount(AuditPage, { global: pagePlugins() });
    await flushPromises();
    const last = String(fetchMock.mock.calls.at(-1)![0]);
    expect(last).toContain('from=2026-11-01T');
    expect(last).toContain('entity=asset');
    expect(w.findAll('[data-filter-chip]').map((c) => c.text())).toEqual([
      'Entidad: Activo',
      'Desde: 01-11-2026',
    ]);
    expect(w.text()).toContain('No hay registros de auditoría');
    await router.push('/auditoria');
  });

  it('la IP no es una columna (la tabla no debe desbordar): va en el detalle expandido, y en la tarjeta', async () => {
    mockApi({
      'GET /api/v1/audit': () => ({ data: [entry(1)], meta: { page: 1, pageSize: 25, total: 1 } }),
    });
    const w = mount(AuditPage, { global: pagePlugins() });
    await flushPromises();
    expect(w.findAll('th').map((th) => th.text())).not.toContain('IP');
    expect(w.text()).not.toContain('10.0.0.1');
    await w.get('button[aria-label^="Detalle"]').trigger('click');
    expect(w.text()).toContain('IP');
    expect(w.text()).toContain('10.0.0.1');
    w.unmount();

    useMobileViewport();
    const card = mount(AuditPage, { global: pagePlugins() });
    await flushPromises();
    expect(card.text()).not.toContain('10.0.0.1');
    await card.get('ul > li button').trigger('click');
    expect(card.get('ul > li dl').text()).toContain('10.0.0.1');
    await router.push('/auditoria');
  });

  describe('columna «Registro» [P40]', () => {
    const ASSET = '018f0000-0000-7000-8000-0000000000a1';
    const rows = [
      entry(1, {
        action: 'asset.update',
        entity: 'asset',
        entityId: ASSET,
        entityLabel: 'INV-000007 Notebook de Ana',
        entityLinkable: true,
      }),
      entry(2, {
        action: 'asset.delete',
        entity: 'asset',
        entityId: '018f0000-0000-7000-8000-0000000000a2',
        entityLabel: 'INV-000008 Sensor viejo',
        entityLinkable: false,
      }),
      entry(3, {
        action: 'auth.login_failed',
        entity: 'user',
        entityId: null,
        entityLabel: null,
        entityLinkable: false,
      }),
    ];

    it('muestra el rótulo de cada registro, enlazado solo si sigue vigente', async () => {
      mockApi({
        'GET /api/v1/audit': () => ({ data: rows, meta: { page: 1, pageSize: 25, total: 3 } }),
      });
      const w = mount(AuditPage, { global: pagePlugins() });
      await flushPromises();
      expect(w.findAll('th').map((th) => th.text())).toContain('Registro');
      const linked = w.findAll('a').find((a) => a.text() === 'INV-000007 Notebook de Ana')!;
      expect(linked.attributes('href')).toBe(`/activos/${ASSET}`);
      expect(w.text()).toContain('INV-000008 Sensor viejo');
      expect(w.findAll('a').some((a) => a.text() === 'INV-000008 Sensor viejo')).toBe(false);
      expect(w.text()).toContain('—'); // sin rótulo
    });

    it('el rótulo se trunca en la tabla y el texto completo está en su tooltip', async () => {
      mockApi({
        'GET /api/v1/audit': () => ({ data: rows, meta: { page: 1, pageSize: 25, total: 3 } }),
      });
      const w = mount(AuditPage, { global: pagePlugins() });
      await flushPromises();
      const cells = w.findAll('[data-testid="audit-record"]');
      expect(cells[0]!.classes()).toContain('truncate');
      const tips = w.findAllComponents({ name: 'UTooltip' }).map((c) => c.props('text'));
      expect(tips).toContain('INV-000007 Notebook de Ana');
    });

    it('en móvil la tarjeta también identifica el registro', async () => {
      useMobileViewport();
      mockApi({
        'GET /api/v1/audit': () => ({ data: [rows[0]], meta: { page: 1, pageSize: 25, total: 1 } }),
      });
      const w = mount(AuditPage, { global: pagePlugins() });
      await flushPromises();
      const card = w.get('ul > li');
      expect(card.text()).toContain('Activo');
      expect(card.get('a').text()).toBe('INV-000007 Notebook de Ana');
    });
  });
});
