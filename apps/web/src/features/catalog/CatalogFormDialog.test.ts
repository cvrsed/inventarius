import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatusLabelDto } from '@inventarius/shared';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import { useConfirm } from '@/shared/ui/useConfirm';
import CatalogFormDialog from './CatalogFormDialog.vue';
import type { Section } from './entities';

const mounted: VueWrapper[] = [];
afterEach(() => {
  useConfirm().close();
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

  it('el subtítulo explica la entidad y la ayuda de «Activo» aparece solo al editar', async () => {
    await open('manufacturers');
    expect(document.body.textContent).toContain('Empresa que fabrica los equipos');
    expect(document.body.textContent).not.toContain('Un registro inactivo no se puede elegir');
    mounted.pop()!.unmount();
    document.body.innerHTML = '';
    await open('manufacturers', { ...created, id: created.id });
    expect(document.body.textContent).toContain('Empresa que fabrica los equipos');
    expect(document.body.textContent).toContain('Un registro inactivo no se puede elegir');
  });

  it('el código del fabricante se rotula así y trae un ejemplo de ayuda', async () => {
    await open('models');
    expect(document.body.textContent).toContain('Código del fabricante');
    expect(document.body.textContent).toContain('Ej.: SDM530-LR-AU915');
    expect(document.body.textContent).not.toContain('Número de modelo');
  });

  it('en un modelo LoRaWAN la clase es obligatoria y el resto son listas en español', async () => {
    const lora = {
      id: '018f0000-0000-7000-8000-000000000042',
      name: 'SDM530',
      modelNumber: null,
      manufacturer: { id: '018f0000-0000-7000-8000-0000000000a1', name: 'Acme' },
      category: {
        id: '018f0000-0000-7000-8000-0000000000b1',
        name: 'Medidores',
        extension: 'lorawan',
      },
      active: true,
      lorawanClass: null,
      lorawanRegion: null,
      lorawanVersion: null,
      lorawanRegionalParameters: null,
      updatedAt: '2026-11-16T12:00:00.000Z',
    };
    const fetchMock = mockApi({
      'PATCH /api/v1/models/018f0000-0000-7000-8000-000000000042': () => lora,
    });
    await open('models', lora);
    const body = document.body.textContent ?? '';
    expect(body).toContain('Seleccione clase');
    expect(body).not.toContain('__empty__');
    expect(body).toContain('Región / plan de frecuencias');
    expect(body).toContain('Versión de parámetros regionales');
    await save();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(false);
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

describe('renombrar o desactivar lo que usan consumibles (D13)', () => {
  const category = (consumableCount: number) => ({
    id: '018f0000-0000-7000-8000-0000000000c1',
    name: 'EPP',
    extension: 'none',
    scope: 'consumable',
    active: true,
    consumableCount,
    updatedAt: '2026-11-16T12:00:00.000Z',
  });
  const patched = (fetchMock: ReturnType<typeof mockApi>) =>
    fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH');

  it('renombrar una categoría en uso pide confirmar diciendo «Afecta a N consumibles»', async () => {
    const fetchMock = mockApi({
      'PATCH /api/v1/categories/018f0000-0000-7000-8000-0000000000c1': () => category(3),
    });
    await open('consumableCategories', category(3));
    await type('#cf-name', 'Protección personal');
    await save();
    const confirm = useConfirm();
    expect(confirm.state.open).toBe(true);
    const rows = confirm.state.options!.rows!;
    expect(rows.find((r) => r.highlight)).toMatchObject({ value: 'Afecta a 3 consumibles' });
    expect(rows.map((r) => r.value).join(' ')).toContain('«EPP» a «Protección personal»');
    expect(patched(fetchMock)).toBe(false);
    await confirm.state.options!.accept();
    await flushPromises();
    expect(patched(fetchMock)).toBe(true);
  });

  it('con un solo consumible dice «Afecta a 1 consumible»', async () => {
    mockApi({});
    await open('consumableCategories', category(1));
    await type('#cf-name', 'Otro nombre');
    await save();
    expect(useConfirm().state.options!.rows!.find((r) => r.highlight)!.value).toBe(
      'Afecta a 1 consumible',
    );
  });

  it('una categoría sin consumibles se renombra sin preguntar', async () => {
    const fetchMock = mockApi({
      'PATCH /api/v1/categories/018f0000-0000-7000-8000-0000000000c1': () => category(0),
    });
    await open('consumableCategories', category(0));
    await type('#cf-name', 'Otro nombre');
    await save();
    expect(useConfirm().state.open).toBe(false);
    expect(patched(fetchMock)).toBe(true);
  });

  it('una unidad en uso pide confirmar al renombrarla', async () => {
    mockApi({});
    await open('units', {
      id: '018f0000-0000-7000-8000-0000000000d1',
      name: 'par',
      plural: 'pares',
      abbreviation: 'par',
      decimals: 0,
      active: true,
      inUse: true,
      consumableCount: 2,
      updatedAt: '2026-11-16T12:00:00.000Z',
    });
    await type('#cf-name', 'pareja');
    await save();
    expect(useConfirm().state.options!.rows!.find((r) => r.highlight)!.value).toBe(
      'Afecta a 2 consumibles',
    );
  });

  it('cambiar otra cosa (no el nombre ni el estado) no pregunta', async () => {
    mockApi({
      'PATCH /api/v1/measure-units/018f0000-0000-7000-8000-0000000000d1': () => ({}),
    });
    await open('units', {
      id: '018f0000-0000-7000-8000-0000000000d1',
      name: 'par',
      plural: 'pares',
      abbreviation: 'par',
      decimals: 0,
      active: true,
      consumableCount: 2,
      updatedAt: '2026-11-16T12:00:00.000Z',
    });
    await type('#cf-abbreviation', 'pr');
    await save();
    // La abreviatura también se ve en todos los consumibles: sí pregunta solo por nombre; aquí no es el nombre.
    expect(useConfirm().state.open).toBe(false);
  });

  describe('«Ubicación superior» al editar (F1)', () => {
    const id = (n: number) => `018f0000-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`;
    // Chile > Lafquen > Parcela h22 > Santiago; Perú queda aparte.
    const tree = [
      { id: id(1), name: 'Chile', parent: null },
      { id: id(2), name: 'Lafquen', parent: id(1) },
      { id: id(3), name: 'Parcela h22', parent: id(2) },
      { id: id(4), name: 'Santiago', parent: id(3) },
      { id: id(5), name: 'Perú', parent: null },
    ];
    const dto = (l: (typeof tree)[number]) => ({
      id: l.id,
      name: l.name,
      parent: null,
      path: l.name,
      type: 'other',
      address: null,
      active: true,
      updatedAt: '2026-11-16T12:00:00.000Z',
    });
    /** Hace lo que la API: con `excludeSubtreeOf` saca a esa ubicación y a todo su subárbol. */
    const locationsApi = (_: RequestInit | undefined, url: string) => {
      const out = new URL(url, 'http://x').searchParams.get('excludeSubtreeOf');
      const gone = new Set<string>();
      if (out) {
        gone.add(out);
        for (let grew = true; grew;) {
          grew = false;
          for (const l of tree) {
            if (l.parent && gone.has(l.parent) && !gone.has(l.id)) {
              gone.add(l.id);
              grew = true;
            }
          }
        }
      }
      const data = tree.filter((l) => !gone.has(l.id)).map(dto);
      return { data, meta: { page: 1, pageSize: 30, total: data.length } };
    };

    it('al editar «Chile» no ofrece Chile, Lafquen, Parcela h22 ni Santiago', async () => {
      mockApi({ 'GET /api/v1/locations': locationsApi });
      await open('locations', dto(tree[0]!));
      q<HTMLButtonElement>('#cf-parent').click();
      await flushPromises();
      const options = [...document.body.querySelectorAll('[role="option"]')].map(
        (o) => o.textContent ?? '',
      );
      expect(options.join('|')).toContain('Perú');
      for (const name of ['Chile', 'Lafquen', 'Parcela h22', 'Santiago'])
        expect(
          options.some((o) => o.includes(name)),
          name,
        ).toBe(false);
    });

    it('al crear ofrece todas las ubicaciones', async () => {
      const fetchMock = mockApi({ 'GET /api/v1/locations': locationsApi });
      await open('locations');
      q<HTMLButtonElement>('#cf-parent').click();
      await flushPromises();
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('excludeSubtreeOf'))).toBe(false);
      expect(document.body.querySelectorAll('[role="option"]')).toHaveLength(5);
    });
  });
});
