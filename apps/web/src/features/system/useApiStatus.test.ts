import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { fetchReadiness, useApiStatus } from './useApiStatus';

afterEach(() => vi.unstubAllGlobals());

const ok = { status: 'ok', checks: { database: 'up', queue: 'up' } };

describe('fetchReadiness', () => {
  it('devuelve el estado validado con el esquema compartido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(ok), { status: 200 })),
    );
    await expect(fetchReadiness()).resolves.toEqual(ok);
  });

  it('acepta un 503 con cuerpo degradado como dato (no como error de red)', async () => {
    const degraded = { status: 'degraded', checks: { database: 'up', queue: 'down' } };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(degraded), { status: 503 })),
    );
    await expect(fetchReadiness()).resolves.toEqual(degraded);
  });

  it('lanza si el cuerpo no cumple el contrato', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"x":1}', { status: 200 })));
    await expect(fetchReadiness()).rejects.toThrow();
  });
});

describe('useApiStatus', () => {
  it('expone el estado cargado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(ok), { status: 200 })),
    );
    const Probe = defineComponent({
      setup() {
        return useApiStatus();
      },
      template: '<div>{{ data?.status }}</div>',
    });
    const wrapper = mount(Probe, {
      global: {
        plugins: [
          [
            VueQueryPlugin,
            { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
          ],
        ],
      },
    });
    await flushPromises();
    expect(wrapper.text()).toBe('ok');
  });
});
