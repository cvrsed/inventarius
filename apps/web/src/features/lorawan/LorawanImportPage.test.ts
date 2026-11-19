import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, pagePlugins } from '@/test-utils';
import LorawanImportPage from './LorawanImportPage.vue';

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

const row = (line: number, errors: string[] = []) => ({
  line,
  serial: `SN-${line}`,
  assetId: errors.length ? null : '018f0000-0000-7000-8000-000000000001',
  assetTag: errors.length ? null : `INV-00000${line}`,
  devEui: '70B3D57ED0000001',
  errors,
});

async function chooseFile(w: ReturnType<typeof mount>, text: string) {
  const input = w.get('input[type="file"]');
  const file = new File([text], 'lorawan.csv', { type: 'text/csv' });
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  await flushPromises();
}

function mountPage(preview: object) {
  const fetchMock = mockApi({
    'POST /api/v1/lorawan/import/preview': () => preview,
    'POST /api/v1/lorawan/import': () => ({ applied: 2 }),
  });
  const w = mount(LorawanImportPage, { global: pagePlugins() });
  mounted.push(w);
  return Object.assign(w, { fetchMock });
}

describe('LorawanImportPage (RF-66)', () => {
  it('con filas válidas muestra el resumen y permite importar', async () => {
    const w = mountPage({ rows: [row(2), row(3)], total: 2, valid: 2, invalid: 0, fileErrors: [] });
    await chooseFile(w, 'serial,DevEUI,JoinEUI,AppKey\n');
    expect(w.get('[role="status"]').text()).toBe('2 filas: 2 válidas, 0 con errores');
    const apply = w.findAll('button').find((b) => b.text().startsWith('Importar'))!;
    expect(apply.text()).toBe('Importar 2 dispositivos');
    expect(apply.attributes('disabled')).toBeUndefined();
    await apply.trigger('click');
    await flushPromises();
    const posted = w.fetchMock.mock.calls.find(
      ([u, i]) => String(u) === '/api/v1/lorawan/import' && i?.method === 'POST',
    );
    expect(JSON.parse(String(posted![1]!.body))).toEqual({ csv: 'serial,DevEUI,JoinEUI,AppKey\n' });
  });

  it('con errores los muestra por fila (primero) y no deja importar', async () => {
    const w = mountPage({
      rows: [row(2), row(3, ['Ningún activo tiene ese número de serie'])],
      total: 2,
      valid: 1,
      invalid: 1,
      fileErrors: [],
    });
    await chooseFile(w, 'x');
    const items = w.findAll('[data-testid="import-rows"] > li');
    expect(items[0]!.text()).toContain('Ningún activo tiene ese número de serie');
    expect(items[1]!.text()).toContain('Correcta');
    expect(w.text()).toContain('no se importará nada');
    const apply = w.findAll('button').find((b) => b.text().startsWith('Importar'))!;
    expect(apply.attributes('disabled')).toBeDefined();
  });

  it('errores del archivo (p. ej. faltan columnas) se muestran y bloquean', async () => {
    const w = mountPage({
      rows: [],
      total: 0,
      valid: 0,
      invalid: 0,
      fileErrors: ['Faltan columnas obligatorias: appKey'],
    });
    await chooseFile(w, 'serial\n');
    expect(w.get('[role="alert"]').text()).toContain('Faltan columnas obligatorias: appKey');
    expect(
      w
        .findAll('button')
        .find((b) => b.text().startsWith('Importar'))!
        .attributes('disabled'),
    ).toBeDefined();
  });
});
