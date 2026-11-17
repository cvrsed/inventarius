import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, pagePlugins, useMobileViewport } from '@/test-utils';
import AuditPage from './AuditPage.vue';

afterEach(() => vi.unstubAllGlobals());

const entry = (n: number, over: Record<string, unknown> = {}) => ({
  id: String(n),
  at: '2026-11-16T15:00:00.000Z',
  actorId: '018f0000-0000-7000-8000-000000000001',
  actorName: 'Ana',
  actorLabel: null,
  action: 'user.update',
  entity: 'user',
  entityId: '018f0000-0000-7000-8000-000000000002',
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
        ],
        meta: { page: 1, pageSize: 25, total: 3 },
      }),
    });
    const w = mount(AuditPage, { global: pagePlugins() });
    await flushPromises();
    expect(w.text()).toContain('Usuario modificado');
    expect(w.text()).toContain('Intento de acceso fallido');
    expect(w.text()).toContain('Sistema');
    expect(w.text()).toContain('CLI (operación)');
    expect(w.text()).toContain('Ana');
  });

  it('en móvil cada registro es una tarjeta cuyo detalle se abre sin scroll horizontal', async () => {
    useMobileViewport();
    mockApi({
      'GET /api/v1/audit': () => ({ data: [entry(1)], meta: { page: 1, pageSize: 25, total: 1 } }),
    });
    const w = mount(AuditPage, { global: pagePlugins() });
    await flushPromises();
    const card = w.get('ul > li');
    expect(card.text()).toContain('Usuario modificado');
    expect(card.find('pre').exists()).toBe(false);
    await card.get('button').trigger('click');
    expect(card.get('pre').classes()).toContain('whitespace-pre-wrap');
    expect(card.get('pre').text()).toContain('"name"');
  });

  it('pide los registros con los filtros de fecha convertidos a instantes', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/audit': () => ({ data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    });
    const w = mount(AuditPage, { global: pagePlugins() });
    await flushPromises();
    await w.get('#f-from').setValue('2026-11-01');
    await flushPromises();
    const last = String(fetchMock.mock.calls.at(-1)![0]);
    expect(last).toContain('from=2026-11-01T');
    expect(w.text()).toContain('No hay registros de auditoría');
  });
});
