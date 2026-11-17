import { flushPromises, mount } from '@vue/test-utils';
import type { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '@inventarius/shared';
import { router } from '@/app/router';
import { useConfirm } from '@/shared/ui/useConfirm';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import AssetDetailPage from './AssetDetailPage.vue';

/** Los componentes montados se desmontan: comparten router y no deben seguir reaccionando a otros tests. */
const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

const ID = '018f0000-0000-7000-8000-000000000001';
const uuid = (n: string) => `018f0000-0000-7000-8000-${n.padStart(12, '0')}`;
const ref = (id: string, name: string) => ({ id: uuid(id.replace(/\D/g, '') || '0'), name });

const baseAsset = {
  id: ID,
  assetTag: 'INV-000001',
  name: 'Notebook de Ana',
  serial: 'SN-1',
  model: ref('m1', 'ThinkPad'),
  manufacturer: ref('f1', 'Lenovo'),
  category: { ...ref('c1', 'Notebooks'), extension: 'none' },
  status: { ...ref('s1', 'Disponible'), kind: 'deployable' },
  location: ref('l1', 'Sala 1'),
  baseLocation: ref('l1', 'Sala 1'),
  assignedUser: null,
  assignedLocation: null,
  deleted: false,
  purchaseDate: '2026-01-31',
  purchaseCost: 499990,
  purchaseCurrency: 'CLP',
  supplier: null,
  warrantyMonths: 12,
  warrantyEndsOn: '2027-01-31',
  notes: null,
  assignment: null,
  deletedAt: null,
  deleteReason: null,
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
};

async function mountAsset(
  asset: Record<string, unknown>,
  permissions: Permission[],
  extra: Parameters<typeof mockApi>[0] = {},
) {
  const fetchMock = mockApi({
    ...extra,
    [`GET /api/v1/assets/${ID}`]: () => ({ ...baseAsset, ...asset }),
    [`GET /api/v1/assets/${ID}/history`]: () => ({
      data: [
        {
          id: '1',
          at: '2026-11-16T12:00:00.000Z',
          actorId: null,
          actorName: 'Olga',
          actorLabel: null,
          action: 'asset.create',
          entity: 'asset',
          entityId: ID,
          diff: { after: { name: 'Notebook de Ana' } },
          ip: null,
        },
      ],
      meta: { page: 1, pageSize: 10, total: 1 },
    }),
  });
  const global = pagePlugins();
  const auth = useAuthStore(global.plugins![0] as ReturnType<typeof createPinia>);
  auth.user = {
    id: '018f0000-0000-7000-8000-0000000000ff',
    email: 'x@y.cl',
    name: 'X',
    mustChangePassword: false,
    roles: [],
    permissions,
  };
  await router.push(`/activos/${ID}`);
  await router.isReady();
  const wrapper = mount(AssetDetailPage, { global });
  mounted.push(wrapper);
  await flushPromises();
  Object.assign(wrapper, { fetchMock });
  return wrapper as typeof wrapper & { fetchMock: typeof fetchMock };
}

const buttons = (w: Awaited<ReturnType<typeof mountAsset>>) =>
  w
    .findAll('button, a')
    .map((b) => b.text().trim())
    .filter(Boolean);

describe('AssetDetailPage (RF-41)', () => {
  it('muestra lo clave arriba: etiqueta, nombre, estado, ubicación y el historial', async () => {
    const w = await mountAsset({}, ['asset:read']);
    expect(w.text()).toContain('INV-000001');
    expect(w.get('h1').text()).toBe('Notebook de Ana');
    expect(w.text()).toContain('Disponible');
    expect(w.text()).toContain('Sala 1');
    expect(w.text()).toContain('Lenovo ThinkPad');
    expect(w.text()).toContain('Alta');
    expect(w.text()).toContain('31-01-2027');
  });

  it('el costo se muestra con su moneda', async () => {
    const clp = await mountAsset({}, ['asset:read']);
    expect(clp.text().replace(/\s/g, '')).toContain('$499.990');
    const usd = await mountAsset({ purchaseCost: 99.5, purchaseCurrency: 'USD' }, ['asset:read']);
    expect(usd.text().replace(/\s/g, '')).toContain('US$99,50');
  });

  it('un lector no ve ninguna acción de escritura', async () => {
    const labels = buttons(await mountAsset({}, ['asset:read']));
    for (const l of [
      'Asignar',
      'Devolver',
      'Cambiar estado',
      'Editar',
      'Dar de baja',
      'Restaurar',
    ]) {
      expect(labels).not.toContain(l);
    }
  });

  it('un operador ve asignar, cambiar estado, editar y dar de baja', async () => {
    const labels = buttons(
      await mountAsset({}, ['asset:read', 'asset:write', 'asset:checkout', 'asset:delete']),
    );
    expect(labels).toEqual(
      expect.arrayContaining(['Asignar', 'Cambiar estado', 'Editar', 'Dar de baja']),
    );
  });

  it('un técnico puede asignar pero no editar', async () => {
    const labels = buttons(await mountAsset({}, ['asset:read', 'asset:checkout']));
    expect(labels).toContain('Asignar');
    expect(labels).not.toContain('Editar');
  });

  it('con una persona la ficha dice «Con <nombre>» y conserva la base', async () => {
    const w = await mountAsset({ location: null, assignedUser: ref('u1', 'Tomás') }, [
      'asset:read',
    ]);
    expect(w.text()).toContain('Con Tomás');
    expect(w.text()).toContain('Ubicación base');
  });

  it('asignado: ofrece devolver y oculta asignar, cambiar estado y dar de baja', async () => {
    const labels = buttons(
      await mountAsset(
        {
          assignedUser: ref('u1', 'Tomás'),
          status: { ...ref('s2', 'Asignado'), kind: 'deployable' },
          assignment: {
            since: '2026-11-16T12:00:00.000Z',
            expectedReturnOn: '2026-12-31',
            note: 'terreno',
          },
        },
        ['asset:read', 'asset:write', 'asset:checkout', 'asset:delete'],
      ),
    );
    expect(labels).toContain('Devolver');
    expect(labels).not.toContain('Asignar');
    expect(labels).not.toContain('Cambiar estado');
    expect(labels).not.toContain('Dar de baja');
  });

  it('un estado no desplegable no ofrece asignar', async () => {
    const labels = buttons(
      await mountAsset({ status: { ...ref('s3', 'En reparación'), kind: 'undeployable' } }, [
        'asset:read',
        'asset:checkout',
      ]),
    );
    expect(labels).not.toContain('Asignar');
  });

  it('dado de baja: solo quien tiene asset:restore ve Restaurar', async () => {
    const gone = { deleted: true, deleteReason: 'Robo', deletedAt: '2026-11-16T12:00:00.000Z' };
    const admin = buttons(await mountAsset(gone, ['asset:read', 'asset:write', 'asset:restore']));
    expect(admin).toContain('Restaurar');
    expect(admin).not.toContain('Editar');
    const operator = buttons(await mountAsset(gone, ['asset:read', 'asset:write', 'asset:delete']));
    expect(operator).not.toContain('Restaurar');
  });

  it('restaurar pide confirmación y llama a la API', async () => {
    const gone = { deleted: true, deleteReason: 'Robo', deletedAt: '2026-11-16T12:00:00.000Z' };
    const w = await mountAsset(gone, ['asset:read', 'asset:restore'], {
      [`POST /api/v1/assets/${ID}/restore`]: () => ({ ...baseAsset }),
    });
    await w
      .findAll('button')
      .find((b) => b.text() === 'Restaurar')!
      .trigger('click');
    const { state, close } = useConfirm();
    expect(state.open).toBe(true);
    await state.options!.accept();
    close();
    expect(w.fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/restore'))).toBe(true);
  });

  it('asignar abre el diálogo de asignación', async () => {
    const w = await mountAsset({}, ['asset:read', 'asset:checkout']);
    await w
      .findAll('button')
      .find((b) => b.text() === 'Asignar')!
      .trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Entrégalo a una persona');
  });

  it('un activo con error de carga ofrece reintentar', async () => {
    mockApi({ [`GET /api/v1/assets/${ID}`]: () => jsonResponse({}, 500) });
    await router.push(`/activos/${ID}`);
    const w = mount(AssetDetailPage, { global: pagePlugins() });
    mounted.push(w);
    await flushPromises();
    expect(w.text()).toContain('Reintentar');
  });
});
