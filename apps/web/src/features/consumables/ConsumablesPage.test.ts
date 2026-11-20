import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { ConsumableDto, Permission } from '@inventarius/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { mockApi, pagePlugins } from '@/test-utils';
import ConsumablesPage from './ConsumablesPage.vue';
import LowStockNotice from './LowStockNotice.vue';
import { consumable, ids } from './fixtures';

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function login(global: ReturnType<typeof pagePlugins>, permissions: Permission[]) {
  useAuthStore(global.plugins![0] as never).user = {
    id: ids.user,
    email: 'x@y.cl',
    name: 'X',
    mustChangePassword: false,
    roles: [],
    permissions,
  };
}

/** Fila del listado: el detalle sin el stock por bodega (que solo trae la ficha). */
const row = (over: Partial<ConsumableDto>): ConsumableDto =>
  Object.fromEntries(
    Object.entries(consumable(over)).filter(([key]) => key !== 'stockByWarehouse'),
  ) as ConsumableDto;

describe('listado de consumibles (RF-70, RF-74)', () => {
  async function mountList(permissions: Permission[], data: ConsumableDto[], query = '') {
    const fetchMock = mockApi({
      'GET /api/v1/consumables': () => ({
        data,
        meta: { page: 1, pageSize: 25, total: data.length },
      }),
    });
    const global = pagePlugins();
    login(global, permissions);
    await router.push(`/consumibles${query}`);
    await router.isReady();
    const w = mount(ConsumablesPage, { global, attachTo: document.body });
    mounted.push(w);
    await flushPromises();
    return { w, fetchMock };
  }

  it('muestra el stock total con su unidad (coma decimal) y marca lo que está bajo el mínimo', async () => {
    const litro = { id: ids.unit, name: 'litro', plural: 'litros', abbreviation: 'L', decimals: 3 };
    const { w } = await mountList(
      ['consumables:read'],
      [
        row({ name: 'Guantes de nitrilo', totalStock: '12', lowStock: true }),
        row({
          id: '0190d1a0-0000-7000-8000-0000000000c2',
          name: 'Alcohol gel',
          unit: litro,
          totalStock: '2.5',
          minStock: '1',
          lowStock: false,
        }),
      ],
    );
    const text = w.text();
    expect(text).toContain('12 pares');
    expect(text).toContain('2,5 L');
    // Uno es el botón del filtro «Bajo mínimo»; el otro, la insignia del único consumible bajo su mínimo.
    expect(text.match(/Bajo mínimo/g)).toHaveLength(2);
    expect(w.find('a[href="/consumibles/' + ids.consumable + '"]').exists()).toBe(true);
  });

  it('por defecto pide solo los activos y respeta el filtro «Bajo mínimo» de la URL', async () => {
    const { fetchMock } = await mountList(['consumables:read'], [], '?lowStock=true');
    const url = String(
      fetchMock.mock.calls.find((c) => String(c[0]).includes('/consumables?'))![0],
    );
    expect(url).toContain('lowStock=true');
    expect(url).toContain('active=true');
  });

  it('el botón de alta es solo para quien gestiona consumibles', async () => {
    const reader = await mountList(['consumables:read'], []);
    expect(reader.w.text()).not.toContain('Nuevo consumible');
    reader.w.unmount();
    mounted.pop();
    const manager = await mountList(['consumables:read', 'consumables:manage'], []);
    expect(manager.w.text()).toContain('Nuevo consumible');
  });
});

describe('aviso de stock mínimo en Inicio (RF-74)', () => {
  async function mountNotice(total: number, permissions: Permission[]) {
    mockApi({
      'GET /api/v1/consumables': () => ({ data: [], meta: { page: 1, pageSize: 1, total } }),
    });
    const global = pagePlugins();
    login(global, permissions);
    await router.push('/');
    await router.isReady();
    const w = mount(LowStockNotice, { global });
    mounted.push(w);
    await flushPromises();
    return w;
  }

  it('cuenta los consumibles bajo mínimo y enlaza al listado filtrado, con la concordancia correcta', async () => {
    const many = await mountNotice(3, ['consumables:read']);
    expect(many.text()).toContain('3 consumibles bajo su mínimo');
    expect(many.get('a').attributes('href')).toBe('/consumibles?lowStock=true');
    many.unmount();
    mounted.pop();
    const one = await mountNotice(1, ['consumables:read']);
    expect(one.text()).toContain('1 consumible bajo su mínimo');
  });

  it('no aparece si no hay nada bajo mínimo ni para quien no puede ver consumibles', async () => {
    const none = await mountNotice(0, ['consumables:read']);
    expect(none.find('a').exists()).toBe(false);
    none.unmount();
    mounted.pop();
    const noAccess = await mountNotice(5, ['asset:read']);
    expect(noAccess.find('a').exists()).toBe(false);
  });
});
