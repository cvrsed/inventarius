import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { router } from '@/app/router';
import { useListQuery } from './useListQuery';

const defaults = { page: 1, pageSize: 25, q: '', statusId: '' };

const Probe = defineComponent({
  setup: () => useListQuery(defaults),
  template: '<div />',
});

async function setup(url: string) {
  await router.push(url);
  await router.isReady();
  const wrapper = mount(Probe, { global: { plugins: [router] } });
  return wrapper.vm as unknown as ReturnType<typeof useListQuery<typeof defaults>>;
}

afterEach(async () => router.push('/'));

describe('useListQuery', () => {
  it('lee el estado de la URL', async () => {
    const list = await setup('/activos?q=router&page=3');
    expect(list.query).toMatchObject({ q: 'router', page: 3, pageSize: 25 });
  });

  it('cambiar un filtro vuelve a la página 1 y conserva los demás', async () => {
    const list = await setup('/activos?q=router&page=3');
    await list.update({ statusId: 'abc' });
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ q: 'router', statusId: 'abc' });
  });

  it('cambiar de página no toca los filtros', async () => {
    const list = await setup('/activos?q=router');
    await list.setPage(4);
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ q: 'router', page: '4' });
  });

  it('reset limpia todos los filtros', async () => {
    const list = await setup('/activos?q=router&statusId=x');
    await list.reset();
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({});
  });

  it('un cambio de filtro con retardo no cancela una navegación a otra página que ya está en curso', async () => {
    // Al escribir en el buscador el cambio se aplica 300 ms después; si en ese lapso la persona pulsa otro enlace y la nueva
    // página tarda en cargar, `router.replace` la cancelaba y la URL volvía al listado.
    const list = await setup('/activos?q=router');
    const guard = router.beforeEach(async (to) => {
      if (to.path === '/') await new Promise((r) => setTimeout(r, 40));
      return true;
    });
    const leaving = router.push('/');
    await new Promise((r) => setTimeout(r, 5)); // la navegación ya empezó y espera a la página nueva
    void list.update({ q: 'tarde' });
    await leaving;
    await flushPromises();
    guard();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('después de esa navegación los cambios de filtro vuelven a aplicarse', async () => {
    const list = await setup('/activos?q=router');
    await router.push('/activos?q=otro');
    await list.update({ statusId: 'z' });
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ q: 'otro', statusId: 'z' });
  });
});
