import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { AssetDto } from '@inventarius/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';
import { router } from '@/app/router';
import { mockApi, pagePlugins } from '@/test-utils';
import RemoteSelect from '@/shared/ui/RemoteSelect.vue';
import AssetActionDialog from './AssetActionDialog.vue';
import AssetFormPage from './AssetFormPage.vue';
import CheckoutDialog from './CheckoutDialog.vue';

/**
 * D23: en los diálogos de activos un campo obligatorio no se marca en rojo al abrir, se marca solo al intentar enviar
 * vacío y deja de estarlo al elegir un valor. Nuxt UI pinta de error cualquier `error` distinto de `undefined`, también
 * `''`: «Asignar activo» abría con Persona en rojo y seguía así después de elegir.
 */
const uuid = (n: number) => `018f0000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const asset = {
  id: uuid(1),
  assetTag: 'INV-000001',
  name: 'Notebook de Ana',
  status: { id: uuid(5), name: 'Disponible', kind: 'deployable' },
  baseLocation: { id: uuid(6), name: 'Sala 1' },
  updatedAt: '2026-11-16T12:00:00.000Z',
} as unknown as AssetDto;

const existing = {
  id: uuid(1),
  assetTag: 'INV-000001',
  name: 'Notebook de Ana',
  serial: 'SN-1',
  model: { id: uuid(2), name: 'ThinkPad' },
  manufacturer: { id: uuid(3), name: 'Lenovo' },
  category: { id: uuid(4), name: 'Notebooks', extension: 'none' },
  status: { id: uuid(5), name: 'Disponible', kind: 'deployable' },
  location: { id: uuid(6), name: 'Sala 1', path: 'Sala 1' },
  baseLocation: { id: uuid(6), name: 'Sala 1' },
  assignedUser: null,
  assignedLocation: null,
  deleted: false,
  devEui: null,
  lnsStatus: null,
  purchaseDate: '2026-01-31',
  purchaseCost: 1500,
  purchaseCurrency: 'CLP',
  supplier: null,
  warrantyMonths: 12,
  warrantyEndsOn: '2027-01-31',
  notes: null,
  assignment: null,
  deletedAt: null,
  deleteReason: null,
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
};

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const marked = () =>
  [...document.body.querySelectorAll('*')].filter(
    (e) =>
      /(^|\s)(ring-error|border-error|text-error)(\/\d+)?(\s|$)/.test(
        String(e.getAttribute('class') ?? ''),
      ) || e.getAttribute('aria-invalid') === 'true',
  );
const red = () =>
  marked()
    .filter((e) => e.tagName !== 'LABEL')
    .map((e) => `${e.tagName}.${e.getAttribute('class')}`);

async function open(component: Component, props: Record<string, unknown>) {
  mockApi({});
  const w = mount(component, {
    props: { ...props, visible: false },
    global: pagePlugins(),
    attachTo: document.body,
  }) as VueWrapper;
  mounted.push(w);
  await w.setProps({ visible: true } as Record<string, unknown>);
  await flushPromises();
  return w;
}
const submit = async () => {
  document.body.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  await flushPromises();
};
/** Elige un valor en el `RemoteSelect` que está en `id`, como si la persona lo hubiera escogido. */
const choose = async (w: VueWrapper, id: string) => {
  const select = w
    .findAllComponents(RemoteSelect)
    .find((c) => c.element.id === id || c.attributes('id') === id || c.props('id') === id)!;
  select.vm.$emit('update:modelValue', { id: uuid(99), name: 'Ana Inventada' });
  await flushPromises();
};

describe('diálogos de activos: obligatorios sin marcar hasta interactuar (D23)', () => {
  it('«Asignar activo»: Persona no sale en rojo al abrir, sí al enviar vacío y deja de estarlo al elegir', async () => {
    const w = await open(CheckoutDialog, { asset });
    expect(document.body.textContent).toContain('Persona');
    expect(document.body.textContent).not.toContain('Este campo es obligatorio');
    expect(red()).toEqual([]);

    await submit();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    expect(red().length).toBeGreaterThan(0);

    await choose(w, 'co-target');
    expect(document.body.textContent).not.toContain('Este campo es obligatorio');
    expect(red()).toEqual([]);
  });

  it('«Asignar activo» a una ubicación se comporta igual', async () => {
    const w = await open(CheckoutDialog, { asset });
    const kind = w.findComponent({ name: 'AppSelect' });
    kind.vm.$emit('update:modelValue', 'location');
    await flushPromises();
    expect(red()).toEqual([]);
    await submit();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    await choose(w, 'co-target');
    expect(red()).toEqual([]);
  });

  it.each([
    ['devolver', 'checkin'],
    ['cambiar estado', 'status'],
  ] as const)('«%s»: el estado no sale en rojo al abrir ni tras elegirlo', async (_n, mode) => {
    const w = await open(AssetActionDialog, { asset, mode });
    expect(document.body.textContent).not.toContain('Este campo es obligatorio');
    expect(red()).toEqual([]);
    await submit();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    expect(red().length).toBeGreaterThan(0);
    await choose(w, 'ac-status');
    expect(document.body.textContent).not.toContain('Este campo es obligatorio');
    expect(red()).toEqual([]);
  });

  it('«dar de baja»: el motivo no sale en rojo al abrir y deja de estarlo al escribirlo', async () => {
    await open(AssetActionDialog, { asset, mode: 'delete' });
    expect(red()).toEqual([]);
    await submit();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    const area = document.body.querySelector<HTMLTextAreaElement>('#ac-text')!;
    area.value = 'Equipo dañado';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    expect(document.body.textContent).not.toContain('Este campo es obligatorio');
    expect(red()).toEqual([]);
  });

  it('«editar»: el formulario de un activo existente no marca nada hasta enviar con campos vacíos', async () => {
    const id = uuid(1);
    mockApi({
      [`GET /api/v1/assets/${id}`]: () => existing,
    });
    await router.push(`/activos/${id}/editar`);
    await router.isReady();
    const w = mount(AssetFormPage, { global: pagePlugins(), attachTo: document.body });
    mounted.push(w);
    await flushPromises();
    expect(document.body.textContent).not.toContain('Este campo es obligatorio');
    expect(red()).toEqual([]);

    await w.get('#a-name').setValue('');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    await w.get('#a-name').setValue('Notebook de Ana');
    await w.get('form').trigger('submit');
    await flushPromises();
    expect(document.body.textContent).not.toContain('Este campo es obligatorio');
  });
});
