import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, pagePlugins } from '@/test-utils';
import LnsProfilesPage from './LnsProfilesPage.vue';

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

const profile = (n: number, devices = 0) => ({
  id: `018f0000-0000-7000-8000-00000000000${n}`,
  kind: n === 1 ? 'chirpstack' : 'ttn',
  name: `Perfil ${n}`,
  description: null,
  endpoint: n === 1 ? 'chirpstack.example.test:8080' : 'https://eu1.example.test',
  tls: false,
  credentialHint: '•••• 9f3a',
  target: {},
  deviceDefaults: {},
  active: true,
  registeredDevices: devices,
  updatedAt: '2026-11-19T12:00:00.000Z',
});

function mountPage(testResult?: object) {
  const fetchMock = mockApi({
    'GET /api/v1/lns-profiles': () => ({
      data: [profile(1, 3), profile(2, 0)],
      meta: { page: 1, pageSize: 25, total: 2 },
    }),
    [`POST /api/v1/lns-profiles/${profile(1).id}/test`]: () =>
      testResult ?? { ok: true, latencyMs: 42, checks: [] },
  });
  const w = mount(LnsProfilesPage, { global: pagePlugins() });
  mounted.push(w);
  return Object.assign(w, { fetchMock });
}

describe('LnsProfilesPage (RF-50 a RF-52)', () => {
  it('lista los perfiles con su proveedor y solo muestra la credencial enmascarada', async () => {
    const w = mountPage();
    await flushPromises();
    expect(w.text()).toContain('Perfil 1');
    expect(w.text()).toContain('ChirpStack v4 (gRPC)');
    expect(w.text()).toContain('TTN / The Things Stack v3');
    expect(w.text()).not.toContain('9f3a');
  });

  it('solo se puede eliminar un perfil sin dispositivos registrados (RF-52)', async () => {
    const w = mountPage();
    await flushPromises();
    const removals = w
      .findAll('button')
      .filter((b) => b.attributes('aria-label')?.startsWith('Eliminar'));
    expect(removals.map((b) => b.attributes('aria-label'))).toEqual(['Eliminar Perfil 2']);
  });

  it('Probar conexión muestra el resultado con la latencia', async () => {
    const w = mountPage();
    await flushPromises();
    await w
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Probar conexión Perfil 1')!
      .trigger('click');
    await flushPromises();
    expect(w.get('[role="status"]').text()).toBe('Conexión correcta (42 ms)');
  });

  it('si la prueba falla muestra qué comprobación falló', async () => {
    const w = mountPage({
      ok: false,
      latencyMs: 7,
      checks: [
        { name: 'tenant', ok: true, detail: null },
        { name: 'application', ok: false, detail: 'ChirpStack no encontró el recurso' },
      ],
    });
    await flushPromises();
    await w
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Probar conexión Perfil 1')!
      .trigger('click');
    await flushPromises();
    expect(w.get('[role="status"]').text()).toContain('La conexión falló (7 ms)');
    expect(w.get('[role="status"]').text()).toContain(
      'Aplicación: ChirpStack no encontró el recurso',
    );
  });

  it('si todas las comprobaciones fallan por lo mismo, muestra un solo mensaje', async () => {
    const detail = 'No se pudo conectar con ChirpStack';
    const w = mountPage({
      ok: false,
      latencyMs: 7,
      checks: ['tenant', 'application', 'deviceProfile'].map((name) => ({
        name,
        ok: false,
        detail,
      })),
    });
    await flushPromises();
    await w
      .findAll('button')
      .find((b) => b.attributes('aria-label') === 'Probar conexión Perfil 1')!
      .trigger('click');
    await flushPromises();
    const text = w.get('[role="status"]').text();
    expect(text).toBe(`La conexión falló (7 ms) — ${detail}`);
  });
});
