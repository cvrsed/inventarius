import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { pagePlugins } from '@/test-utils';
import PagedFooter from './PagedFooter.vue';

describe('PagedFooter', () => {
  it('muestra las filas por página y la paginación de un total conocido', async () => {
    const w = mount(PagedFooter, {
      props: { page: 1, pageSize: 10, total: 95, pageSizes: [10, 25, 50] },
      global: pagePlugins(),
    });
    await flushPromises();
    expect(w.text()).toContain('Filas por página');
    expect(w.find('nav[aria-label], nav').exists()).toBe(true);
    expect(w.text()).toContain('10');
  });
});
