import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { globalPlugins } from '@/test-utils';
import StatusCard from './StatusCard.vue';

afterEach(() => vi.unstubAllGlobals());

function respond(body: unknown, status = 200): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}

describe('StatusCard', () => {
  it('muestra skeleton mientras carga', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));
    const wrapper = mount(StatusCard, { global: globalPlugins() });
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
  });

  it('muestra todo operativo', async () => {
    respond({ status: 'ok', checks: { database: 'up', queue: 'up' } });
    const wrapper = mount(StatusCard, { global: globalPlugins() });
    await flushPromises();
    expect(wrapper.text()).toContain('Todo funciona con normalidad');
    expect(wrapper.text()).toContain('Base de datos');
  });

  it('señala el componente caído cuando está degradado', async () => {
    respond({ status: 'degraded', checks: { database: 'up', queue: 'down' } }, 503);
    const wrapper = mount(StatusCard, { global: globalPlugins() });
    await flushPromises();
    expect(wrapper.text()).toContain('Hay componentes con problemas');
    expect(wrapper.text()).toContain('Sin respuesta');
  });

  it('ofrece reintentar si la API no responde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('red')));
    const wrapper = mount(StatusCard, { global: globalPlugins() });
    await flushPromises();
    expect(wrapper.text()).toContain('No se pudo consultar el estado');
    expect(wrapper.text()).toContain('Reintentar');
  });
});
