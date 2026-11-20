import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';
import { mockApi, pagePlugins } from '@/test-utils';
import ConsumableFormDialog from './ConsumableFormDialog.vue';
import { consumable, movement, warehouses } from './fixtures';
import MovementDialog from './MovementDialog.vue';
import ReturnDialog from './ReturnDialog.vue';
import ReverseDialog from './ReverseDialog.vue';

/**
 * P15: un campo obligatorio no se marca en rojo antes de que la persona lo toque o intente enviar. Nuxt UI pinta el
 * campo de error con cualquier `error` que no sea `undefined`, también con `''`: el motivo de anulación salía en rojo al
 * abrir el diálogo.
 */
const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const delivery = movement({
  kind: 'delivery',
  delta: '-4',
  recipient: { userId: null, name: 'Persona Inventada', ref: null },
  returned: '0',
  returnable: true,
});

const dialogs = [
  ['anular', ReverseDialog, { movement: delivery, consumable: consumable() }],
  ['devolución', ReturnDialog, { delivery, consumable: consumable() }],
  ['ingreso', MovementDialog, { kind: 'receipt', consumable: consumable() }],
  ['entrega', MovementDialog, { kind: 'delivery', consumable: consumable() }],
  ['traslado', MovementDialog, { kind: 'transfer', consumable: consumable() }],
  ['ajuste', MovementDialog, { kind: 'adjustment', consumable: consumable() }],
  ['consumible nuevo', ConsumableFormDialog, { item: null }],
  ['consumible existente', ConsumableFormDialog, { item: consumable() }],
] as const;

const marked = () =>
  [...document.body.querySelectorAll('*')].filter(
    (e) =>
      /(^|\s)(ring-error|border-error|text-error)(\/\d+)?(\s|$)/.test(
        String(e.getAttribute('class') ?? ''),
      ) || e.getAttribute('aria-invalid') === 'true',
  );

async function open(component: unknown, props: Record<string, unknown>) {
  mockApi({ 'GET /api/v1/locations': () => warehouses() });
  const w = mount(component as Component, {
    props: { ...props, visible: false },
    global: pagePlugins(),
    attachTo: document.body,
  }) as VueWrapper;
  mounted.push(w);
  await w.setProps({ visible: true } as Record<string, unknown>);
  await flushPromises();
  return w;
}

describe('obligatorios sin marcar antes de interactuar (P15)', () => {
  it.each(dialogs)(
    '«%s»: al abrir no hay campos en rojo ni mensajes de error',
    async (_n, c, p) => {
      await open(c, p as unknown as Record<string, unknown>);
      expect(document.body.textContent).not.toContain('Este campo es obligatorio');
      expect(document.body.querySelector('[role="alert"]')).toBeNull();
      // El asterisco de «obligatorio» es del rótulo; ningún campo ni mensaje está en rojo todavía.
      const red = marked().filter((e) => e.tagName !== 'LABEL');
      expect(red.map((e) => `${e.tagName}.${e.getAttribute('class')}`)).toEqual([]);
    },
  );

  it('al intentar enviar el motivo vacío sí se marca el campo y dice por qué', async () => {
    await open(ReverseDialog, { movement: delivery, consumable: consumable() });
    document.body.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await flushPromises();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    expect(document.body.querySelector('textarea')!.getAttribute('aria-invalid')).toBe('true');
  });
});
