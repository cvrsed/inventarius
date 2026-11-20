import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, pagePlugins } from '@/test-utils';
import LinkDialog from './LinkDialog.vue';

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const ASSET = '018f0000-0000-7000-8000-000000000001';
const PROFILE = '018f0000-0000-7000-8000-0000000000aa';

const preview = (over: Record<string, unknown> = {}) => ({
  profile: { id: PROFILE, name: 'ChirpStack de prueba', kind: 'chirpstack' },
  externalId: '70b3d57ed0000001',
  remote: {
    name: 'Medidor ajeno',
    joinEui: 'AABBCCDDEEFF0011',
    deviceProfileId: 'dp-remoto',
    hasAppKey: false,
    hasNwkKey: false,
  },
  differences: [
    { field: 'joinEui', local: '8877665544332211', remote: 'AABBCCDDEEFF0011' },
    { field: 'appKey', local: 'present', remote: 'absent' },
    { field: 'name', local: 'INV-1 Sensor', remote: 'Medidor ajeno' },
  ],
  adoptable: ['joinEui'],
  adopts: ['joinEui'],
  ...over,
});

async function open(body: object, resolve: () => Response | object = () => ({})) {
  const fetchMock = mockApi({
    [`POST /api/v1/assets/${ASSET}/lns-registration/link-preview`]: () => body,
    [`POST /api/v1/assets/${ASSET}/lns-registration/resolve`]: resolve,
  });
  const w = mount(LinkDialog, {
    props: { assetId: ASSET, visible: false },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await w.setProps({ visible: true });
  await flushPromises();
  return Object.assign(w, { fetchMock });
}

const button = (label: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;
/** El checkbox (rol `checkbox`) que acompaña a la etiqueta; su estado se lee de `aria-checked`. */
const checkbox = (label: string) => {
  const l = [...document.body.querySelectorAll('label')].find(
    (x) => x.textContent?.trim() === label,
  )!;
  return document.getElementById(l.htmlFor)!;
};
const isChecked = (label: string) => checkbox(label).getAttribute('aria-checked') === 'true';
const calls = (w: Awaited<ReturnType<typeof open>>, path: string) =>
  w.fetchMock.mock.calls.filter(([u]) => String(u).endsWith(path));

describe('LinkDialog: vincular (P6)', () => {
  it('al abrir lee el dispositivo remoto y muestra lo que tiene el LNS y las diferencias, sin vincular todavía', async () => {
    const w = await open(preview());
    const text = document.body.textContent ?? '';
    expect(calls(w, '/link-preview')).toHaveLength(1);
    expect(calls(w, '/resolve')).toHaveLength(0);
    expect(text).toContain('Lo que tiene el LNS');
    expect(text).toContain('Medidor ajeno');
    expect(text).toContain('AABBCCDDEEFF0011');
    expect(text).toContain('JoinEUI: el activo tiene 8877665544332211 y el LNS AABBCCDDEEFF0011');
    expect(text).toContain('AppKey: no está en el LNS (en el activo: cargada)');
    expect(text).toContain('Nombre: el activo tiene INV-1 Sensor y el LNS Medidor ajeno');
    expect(text).toContain('Datos del LNS que se adoptan en el activo');
    expect(isChecked('JoinEUI')).toBe(true);
    expect(text).toContain('Vincular no modifica el dispositivo en el LNS');
  });

  it('ofrece adoptar los datos del LNS o cancelar; cancelar cierra sin llamar a nada más', async () => {
    const w = await open(preview());
    expect(button('Adoptar los datos del LNS y vincular')).toBeTruthy();
    button('Cancelar').click();
    await flushPromises();
    expect(calls(w, '/resolve')).toHaveLength(0);
  });

  it('adoptar llama a resolve con «link»', async () => {
    const w = await open(preview(), () => ({
      status: 'registered',
      profile: { id: PROFILE, name: 'CS', kind: 'chirpstack' },
      externalId: 'x',
      origin: 'linked',
      lastError: null,
      orphans: [],
      attempts: 1,
      registeredAt: null,
      remote: null,
      updatedAt: '2026-11-19T12:00:00.000Z',
    }));
    button('Adoptar los datos del LNS y vincular').click();
    await flushPromises();
    const [, init] = calls(w, '/resolve')[0]!;
    expect(JSON.parse(String(init!.body))).toEqual({ action: 'link', adopt: ['joinEui'] });
  });

  it('un JoinEUI sin definir (ceros) se muestra como tal, no se adopta por defecto y el usuario puede elegirlo', async () => {
    const zeros = '0000000000000000';
    const w = await open(
      preview({
        remote: { ...preview().remote, joinEui: zeros },
        differences: [{ field: 'joinEui', local: '8877665544332211', remote: zeros }],
        adoptable: ['joinEui', 'appKey'],
        adopts: ['appKey'],
      }),
      () => ({}),
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain(
      'el activo tiene 8877665544332211 y el LNS sin definir en el LNS (todo ceros)',
    );
    expect(text).toContain('no se adopta salvo que lo elijas');
    expect(isChecked('JoinEUI')).toBe(false);
    expect(isChecked('AppKey')).toBe(true);
    button('Adoptar los datos del LNS y vincular').click();
    await flushPromises();
    expect(JSON.parse(String(calls(w, '/resolve')[0]![1]!.body))).toEqual({
      action: 'link',
      adopt: ['appKey'],
    });
  });

  it('el usuario elige por campo qué adoptar', async () => {
    const w = await open(
      preview({ adoptable: ['joinEui', 'appKey'], adopts: ['joinEui', 'appKey'] }),
      () => ({}),
    );
    checkbox('AppKey').click();
    await flushPromises();
    button('Adoptar los datos del LNS y vincular').click();
    await flushPromises();
    expect(JSON.parse(String(calls(w, '/resolve')[0]![1]!.body))).toEqual({
      action: 'link',
      adopt: ['joinEui'],
    });
  });

  it('sin diferencias lo dice y no hay nada que reemplazar', async () => {
    await open(preview({ differences: [], adoptable: [], adopts: [] }));
    const text = document.body.textContent ?? '';
    expect(text).toContain('coincide con el activo');
    expect(text).toContain('No hay datos que reemplazar');
  });

  it('si la lectura falla muestra el motivo y no deja adoptar', async () => {
    mockApi({
      [`POST /api/v1/assets/${ASSET}/lns-registration/link-preview`]: () =>
        new Response(
          JSON.stringify({
            type: 'https://inventarius.local/problems/conflict',
            title: 'Conflicto',
            status: 409,
            detail: 'No se pudo leer el dispositivo en el LNS: No se pudo conectar con ChirpStack',
          }),
          { status: 409, headers: { 'content-type': 'application/problem+json' } },
        ),
    });
    const w = mount(LinkDialog, {
      props: { assetId: ASSET, visible: false },
      global: pagePlugins(),
      attachTo: document.body,
    });
    mounted.push(w);
    await w.setProps({ visible: true });
    await flushPromises();
    expect(document.body.textContent).toContain('No se pudo conectar con ChirpStack');
    expect(button('Adoptar los datos del LNS y vincular').disabled).toBe(true);
  });
});
