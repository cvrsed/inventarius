import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pagePlugins } from '@/test-utils';
import RemoteSelect from './RemoteSelect.vue';

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  document.getElementById('app')?.removeAttribute('inert');
});

function mountSelect(props: Record<string, unknown> = {}) {
  const fetcher = vi.fn(async (q: string) => [
    { id: '018f0000-0000-7000-8000-000000000001', name: `Uno ${q}`.trim() },
    { id: '018f0000-0000-7000-8000-000000000002', name: 'Dos' },
  ]);
  const w = mount(RemoteSelect, {
    props: {
      source: `test-${Math.random()}`,
      fetcher,
      placeholder: 'Elige algo',
      id: 'rs',
      ...props,
    },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  return { w, fetcher };
}

describe('RemoteSelect', () => {
  it('no consulta hasta que se abre y muestra el placeholder', async () => {
    const { w, fetcher } = mountSelect();
    await flushPromises();
    expect(fetcher).not.toHaveBeenCalled();
    expect(w.text()).toContain('Elige algo');
  });

  it('al abrir busca en el servidor y lista las opciones', async () => {
    const { w, fetcher } = mountSelect();
    await w.get('#rs').trigger('click');
    await flushPromises();
    expect(fetcher).toHaveBeenCalledWith('');
    expect(document.body.textContent).toContain('Uno');
    expect(document.body.textContent).toContain('Dos');
  });

  it('lo ya elegido se muestra aunque la búsqueda no lo traiga', async () => {
    const { w } = mountSelect({ modelValue: { id: 'x', name: 'Elegido antes' } });
    await flushPromises();
    expect(w.text()).toContain('Elegido antes');
  });

  it('deja el fondo inerte mientras está abierto y lo restaura al cerrar', async () => {
    const app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
    const { w } = mountSelect();
    await w.get('#rs').trigger('click');
    await flushPromises();
    expect(app.hasAttribute('inert')).toBe(true);
    w.unmount();
    mounted.length = 0;
    expect(app.hasAttribute('inert')).toBe(false);
  });
});
