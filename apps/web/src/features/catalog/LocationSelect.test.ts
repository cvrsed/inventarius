import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pagePlugins } from '@/test-utils';
import { fetchOptions } from './api';
import LocationSelect from './LocationSelect.vue';

vi.mock('./api', () => ({
  fetchOptions: vi.fn(async () => [
    { id: '018f0000-0000-7000-8000-000000000001', name: 'Sala 201', description: 'Chile › Norte' },
    { id: '018f0000-0000-7000-8000-000000000002', name: 'Chile' },
  ]),
}));

const mounted: VueWrapper[] = [];
beforeEach(() => vi.mocked(fetchOptions).mockClear());
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  document.getElementById('app')?.removeAttribute('inert');
});

async function open(props: Record<string, unknown> = {}) {
  const w = mount(LocationSelect, {
    props: { id: 'ls', placeholder: 'Elige', ...props },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await w.get('#ls').trigger('click');
  await flushPromises();
  return w;
}

describe('LocationSelect (U7)', () => {
  it('ofrece el buscador «Buscar ubicación…» y muestra el nombre y, debajo, la ruta', async () => {
    await open();
    expect(document.body.querySelector('input[placeholder="Buscar ubicación…"]')).not.toBeNull();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Sala 201');
    expect(text).toContain('Chile › Norte');
  });

  it('por defecto ofrece las ubicaciones activas de cualquier tipo', async () => {
    await open();
    expect(fetchOptions).toHaveBeenCalledWith('locations', '', {});
  });

  it('«warehouse» ofrece solo bodegas', async () => {
    await open({ scope: 'warehouse' });
    expect(fetchOptions).toHaveBeenCalledWith('locations', '', { extra: { type: 'warehouse' } });
  });

  it('«site» ofrece solo lugares que no son bodega', async () => {
    await open({ scope: 'site' });
    expect(fetchOptions).toHaveBeenCalledWith('locations', '', {
      extra: { excludeType: 'warehouse' },
    });
  });
});
