import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { globalPlugins } from '@/test-utils';
import AppLayout from './AppLayout.vue';

afterEach(() => vi.unstubAllGlobals());

describe('AppLayout', () => {
  it('tiene enlace para saltar al contenido, navegación y landmark main', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    await router.push('/');
    await router.isReady();
    const wrapper = mount(AppLayout, { global: globalPlugins() });
    await flushPromises();

    expect(wrapper.get('a.app-skip-link').attributes('href')).toBe('#contenido');
    expect(wrapper.find('main#contenido').exists()).toBe(true);
    expect(wrapper.findAll('nav[aria-label="Navegación principal"]')).toHaveLength(2);
    expect(wrapper.get('h1').text()).toBe('Inicio');
  });

  it('el botón de tema tiene nombre accesible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
    await router.push('/');
    const wrapper = mount(AppLayout, { global: globalPlugins() });
    const toggle = wrapper.get('button[aria-label="Cambiar a modo oscuro"]');
    await toggle.trigger('click');
    expect(wrapper.find('button[aria-label="Cambiar a modo claro"]').exists()).toBe(true);
  });
});
