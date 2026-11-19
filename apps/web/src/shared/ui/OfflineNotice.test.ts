import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pagePlugins } from '@/test-utils';
import OfflineNotice from './OfflineNotice.vue';

afterEach(() => vi.restoreAllMocks());

describe('OfflineNotice (RF-42)', () => {
  it('no muestra nada con red', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const wrapper = mount(OfflineNotice, { global: pagePlugins() });
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
  });

  it('avisa al perder la conexión y lo retira al recuperarla', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const wrapper = mount(OfflineNotice, { global: pagePlugins(), attachTo: document.body });
    window.dispatchEvent(new Event('offline'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="status"]').text()).toContain('Sin conexión');
    window.dispatchEvent(new Event('online'));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('arranca con el aviso si ya no hay red', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const wrapper = mount(OfflineNotice, { global: pagePlugins() });
    expect(wrapper.find('[role="status"]').exists()).toBe(true);
  });
});
