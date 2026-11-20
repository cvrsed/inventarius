import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { pagePlugins } from '@/test-utils';
import WarehouseSelect, { type WarehouseOption } from './WarehouseSelect.vue';

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  document.getElementById('app')?.removeAttribute('inert');
});

const items: WarehouseOption[] = [
  { id: 'a', name: 'Bodega central', parents: 'Zensi › Chile', stock: '10 pares' },
  { id: 'b', name: 'Bodega anexo', parents: '', stock: '0 pares', disabledReason: 'Sin stock' },
  { id: 'c', name: 'Bodega cerrada', parents: '', stock: '4 pares', note: 'Inactiva' },
];

async function open(modelValue = '') {
  const w = mount(WarehouseSelect, {
    props: { items, placeholder: 'Elige una bodega', id: 'ws', modelValue },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await w.get('#ws').trigger('click');
  await flushPromises();
  return w;
}
const options = () => [...document.body.querySelectorAll<HTMLElement>('[role="option"]')];

describe('WarehouseSelect (P13)', () => {
  it('cada opción lleva el nombre, la ruta en una segunda línea y el stock a la derecha', async () => {
    await open();
    const first = options().find((o) => o.textContent?.includes('Bodega central'))!;
    expect(first.querySelector('[data-testid="warehouse-path"]')?.textContent).toBe(
      'Zensi › Chile',
    );
    expect(first.querySelector('[data-testid="warehouse-stock"]')?.textContent).toBe('10 pares');
    // Sin ruta de padres no hay segunda línea.
    const second = options().find((o) => o.textContent?.includes('Bodega anexo'))!;
    expect(second.querySelector('[data-testid="warehouse-path"]')).toBeNull();
  });

  it('una bodega que no sirve para la acción se ve apagada y dice por qué (P7)', async () => {
    await open();
    const blocked = options().find((o) => o.textContent?.includes('Bodega anexo'))!;
    expect(blocked.getAttribute('data-disabled')).not.toBeNull();
    expect(blocked.textContent).toContain('Sin stock');
    const allowed = options().find((o) => o.textContent?.includes('Bodega central'))!;
    expect(allowed.getAttribute('data-disabled')).toBeNull();
    // Un aviso no impide elegirla.
    const noted = options().find((o) => o.textContent?.includes('Bodega cerrada'))!;
    expect(noted.getAttribute('data-disabled')).toBeNull();
    expect(noted.textContent).toContain('Inactiva');
  });

  it('los textos largos pasan a otra línea en vez de recortarse', async () => {
    await open();
    for (const el of document.body.querySelectorAll('[role="option"] .break-words')) {
      expect(el.className).toContain('whitespace-normal');
      expect(el.className).not.toContain('truncate');
    }
  });

  it('elegir una opción actualiza el valor', async () => {
    const w = await open();
    options()
      .find((o) => o.textContent?.includes('Bodega central'))!
      .click();
    await flushPromises();
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['a']);
  });
});
