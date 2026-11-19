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
});
