import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetDto } from '@inventarius/shared';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import AssetActionDialog from './AssetActionDialog.vue';

const uuid = (n: number) => `018f0000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const asset = {
  id: uuid(1),
  assetTag: 'INV-000001',
  name: 'Notebook',
  status: { id: uuid(10), name: 'Disponible', kind: 'deployable' },
  baseLocation: { id: uuid(20), name: 'Bodega Central' },
  updatedAt: '2026-11-16T12:00:00.000Z',
} as unknown as AssetDto;

const mounted: VueWrapper[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

/** Como en la ficha: el diálogo existe cerrado y se abre después (el formulario se reinicia al abrir). */
async function open(mode: 'checkin' | 'status' | 'delete') {
  const w = mount(AssetActionDialog, {
    props: { asset, mode, visible: false },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await w.setProps({ visible: true });
  await flushPromises();
  return w;
}
const body = () => document.body;
const submit = async () => {
  (body().querySelector('button[type="submit"]') as HTMLButtonElement).click();
  await flushPromises();
};
const field = (selector: string) => body().querySelector(selector) as HTMLTextAreaElement;

describe('AssetActionDialog', () => {
  it('devolver precarga la bodega base y la manda como locationId', async () => {
    await open('checkin');
    expect(body().textContent).toContain('Devolver a');
    expect(body().textContent).toContain('Bodega Central');
  });

  it('devolver sin bodega de destino no envía y pide el campo', async () => {
    const fetchMock = mockApi({});
    const w = mount(AssetActionDialog, {
      props: { asset: { ...asset, baseLocation: null }, mode: 'checkin', visible: false },
      global: pagePlugins(),
      attachTo: document.body,
    });
    mounted.push(w);
    await w.setProps({ visible: true });
    await flushPromises();
    await submit();
    expect(body().textContent).toContain('Este campo es obligatorio');
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });

  it('dar de baja exige un motivo y lo manda en el DELETE', async () => {
    const fetchMock = mockApi({
      [`DELETE /api/v1/assets/${asset.id}`]: () => jsonResponse(null, 204),
    });
    await open('delete');
    await submit();
    expect(body().textContent).toContain('Este campo es obligatorio');
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false);

    const reason = field('#ac-text');
    reason.value = 'Equipo robado';
    reason.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    await submit();
    const call = fetchMock.mock.calls.find((c) => c[1]?.method === 'DELETE')!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ reason: 'Equipo robado' });
  });

  it('cambiar estado pide el nuevo estado, ofrece nota y no usa PATCH', async () => {
    const fetchMock = mockApi({});
    await open('status');
    expect(body().textContent).toContain('Estado actual: Disponible');
    expect(body().textContent).toContain('Nuevo estado');
    expect(body().textContent).toContain('Nota (opcional)');
    await submit();
    expect(body().textContent).toContain('Este campo es obligatorio');
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'PATCH')).toBe(false);
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === 'POST')).toBe(false);
  });

  it.each(['status', 'checkin'] as const)(
    '«%s»: no ofrece «Asignado» ni estados de baja; la baja es solo «Dar de baja» (R5)',
    async (mode) => {
      const row = (n: number, name: string, kind: string, isSystem = false) => ({
        id: uuid(n),
        name,
        kind,
        isSystem,
        active: true,
        updatedAt: '2026-11-16T12:00:00.000Z',
      });
      mockApi({
        'GET /api/v1/status-labels': () => ({
          data: [
            row(11, 'En reparación', 'undeployable'),
            row(12, 'Asignado', 'deployable', true),
            row(13, 'Retirado', 'archived'),
          ],
          meta: { page: 1, pageSize: 25, total: 3 },
        }),
      });
      await open(mode);
      (body().querySelector('#ac-status') as HTMLElement).click();
      await flushPromises();
      const text = body().textContent ?? '';
      expect(text).toContain('En reparación');
      expect(text).not.toContain('Asignado');
      expect(text).not.toContain('Retirado');
    },
  );

  it('devolver pide el estado de vuelta antes de enviar', async () => {
    const fetchMock = mockApi({});
    await open('checkin');
    await submit();
    expect(body().textContent).toContain('Este campo es obligatorio');
    expect(
      fetchMock.mock.calls.some((c) => c[1]?.method === 'POST' && String(c[0]).includes('checkin')),
    ).toBe(false);
  });

  it('muestra el error de la API sin cerrar el diálogo', async () => {
    mockApi({
      [`DELETE /api/v1/assets/${asset.id}`]: () =>
        jsonResponse(
          {
            type: 'https://inventarius.local/problems/conflict',
            title: 'Conflicto',
            status: 409,
            detail: 'El activo está asignado',
          },
          409,
        ),
    });
    await open('delete');
    const reason = field('#ac-text');
    reason.value = 'x';
    reason.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    await submit();
    expect(body().querySelector('[role="alert"]')?.textContent).toContain(
      'El activo está asignado',
    );
  });
});
