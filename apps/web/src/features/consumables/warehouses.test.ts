import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { mockApi } from '@/test-utils';
import { useWarehouses } from './api';

afterEach(() => vi.unstubAllGlobals());

const place = (n: number) => ({
  id: `0190d1a0-0000-7000-8000-${String(n).padStart(12, '0')}`,
  name: `Bodega ${n}`,
  parent: null,
  path: `Bodega ${n}`,
  type: 'warehouse',
  address: null,
  active: true,
  updatedAt: '2026-11-16T12:00:00.000Z',
});

describe('useWarehouses', () => {
  it('pide todas las páginas: una bodega no queda fuera del selector por haber más de 100', async () => {
    const pages = [
      Array.from({ length: 100 }, (_, i) => place(i + 1)),
      Array.from({ length: 30 }, (_, i) => place(i + 101)),
    ];
    const fetchMock = mockApi({
      'GET /api/v1/locations': (_init, url) => {
        const page = Number(new URL(url!, 'http://x').searchParams.get('page') ?? '1');
        return { data: pages[page - 1] ?? [], meta: { page, pageSize: 100, total: 130 } };
      },
    });
    let result: { data: { value: { id: string }[] | undefined } } | undefined;
    const host = defineComponent({
      setup() {
        result = { data: useWarehouses().data as never };
        return () => null;
      },
    });
    mount(host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } });
    await flushPromises();
    await flushPromises();
    expect(result!.data.value).toHaveLength(130);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/locations'))).toHaveLength(2);
  });
});
