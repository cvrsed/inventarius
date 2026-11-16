import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatusLabelDto } from '@inventarius/shared';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import CatalogFormDialog from './CatalogFormDialog.vue';
import type { Section } from './entities';

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function open(section: Section, item: unknown = null) {
  const w = mount(CatalogFormDialog, {
    props: { section, item: item as never, visible: false },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await w.setProps({ visible: true });
  await flushPromises();
  return w;
}
const q = <T extends Element>(s: string) => document.body.querySelector<T>(s)!;
const type = async (selector: string, value: string) => {
  const el = q<HTMLInputElement>(selector);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await flushPromises();
};
const save = async () => {
  q<HTMLButtonElement>('button[type="submit"]').click();
  await flushPromises();
};

const created = {
  id: '018f0000-0000-7000-8000-000000000001',
  name: 'Acme',
  active: true,
  updatedAt: '2026-11-16T12:00:00.000Z',
};

describe('CatalogFormDialog', () => {
  it('exige el nombre antes de enviar', async () => {
    const fetchMock = mockApi({ 'POST /api/v1/manufacturers': () => jsonResponse(created, 201) });
    await open('manufacturers');
    await save();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });

  it('crea con el cuerpo esperado y cierra el diálogo', async () => {
    const fetchMock = mockApi({ 'POST /api/v1/manufacturers': () => jsonResponse(created, 201) });
    const w = await open('manufacturers');
    await type('#cf-name', '  Acme  ');
    await save();
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ name: 'Acme' });
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false]);
  });

  it('un modelo pide fabricante y categoría', async () => {
    await open('models');
    await type('#cf-name', 'SDM530');
    await save();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    expect(document.body.textContent).toContain('Fabricante');
    expect(document.body.textContent).toContain('Categoría');
  });

  it('muestra el error de validación del servidor junto al campo', async () => {
    mockApi({
      'POST /api/v1/locations': () =>
        jsonResponse(
          {
            type: 'https://inventarius.local/problems/validation',
            title: 'Datos inválidos',
            status: 422,
            detail: 'La ubicación no existe',
            errors: { parentId: ['La ubicación no existe'] },
          },
          422,
        ),
    });
    await open('locations');
    await type('#cf-name', 'Sala');
    await save();
    expect(document.body.textContent).toContain('La ubicación no existe');
  });

  it('en edición manda If-Match y los campos editados más el interruptor activo', async () => {
    const fetchMock = mockApi({
      'PATCH /api/v1/manufacturers/018f0000-0000-7000-8000-000000000001': () => created,
    });
    await open('manufacturers', created);
    await type('#cf-name', 'Acme SpA');
    await save();
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!;
    expect((call[1]!.headers as Record<string, string>)['if-match']).toBe(`"${created.updatedAt}"`);
    expect(JSON.parse(String(call[1]!.body))).toEqual({ name: 'Acme SpA', active: true });
  });

  it('el estado del sistema se ve pero no se puede guardar', async () => {
    const system: StatusLabelDto = {
      id: '018f0000-0000-7000-8000-000000000009',
      name: 'Asignado',
      kind: 'deployable',
      active: true,
      isSystem: true,
      updatedAt: '2026-11-16T12:00:00.000Z',
    };
    await open('statuses', system);
    expect(document.body.textContent).toContain('Lo usa el sistema');
    expect(q<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true);
    expect(q<HTMLInputElement>('#cf-name').disabled).toBe(true);
  });
});
