import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AppSelect from '@/shared/ui/AppSelect.vue';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import RegisterLnsDialog from './RegisterLnsDialog.vue';

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
  deviceName: 'INV-000001 Sensor',
  description: 'Sensor',
  externalId: '70b3d57ed0000001',
  devEui: '70B3D57ED0000001',
  joinEui: '8877665544332211',
  appKey: '•••• (32 hex)',
  nwkKey: null,
  deviceClass: 'A',
  lorawanVersion: '1.0.3',
  region: 'AU915',
  tags: [{ key: 'inventarius_asset_id', value: ASSET }],
  target: {
    tenantId: '0190a1b2-0000-7000-8000-000000000001',
    applicationId: '0190a1b2-0000-7000-8000-000000000002',
  },
  deviceProfile: { name: 'Perfil AU915', version: 'LoRaWAN 1.0.3', region: 'AU915' },
  mismatches: [],
  fromDeviceProfile: [],
  ...over,
});

async function openWith(previewBody: object, register?: () => Response) {
  const fetchMock = mockApi({
    ...(register ? { [`POST /api/v1/assets/${ASSET}/lns-registration`]: register } : {}),
    'GET /api/v1/lns-profiles/options': () => [
      { id: PROFILE, name: 'ChirpStack de prueba', kind: 'chirpstack' },
    ],
    [`POST /api/v1/assets/${ASSET}/lns-registration/preview`]: () => previewBody,
  });
  const w = mount(RegisterLnsDialog, {
    props: { assetId: ASSET, visible: true },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await flushPromises();
  w.findComponent(AppSelect).vm.$emit('update:modelValue', PROFILE);
  await flushPromises();
  return Object.assign(w, { fetchMock });
}

const confirmButton = () =>
  [...document.body.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Confirmar y registrar'),
  )!;

describe('RegisterLnsDialog: confirmación exacta (P9)', () => {
  it('muestra perfil, nombre, EUIs, AppKey enmascarada, device profile, clase y tags, y no la clave', async () => {
    await openWith(preview());
    const text = document.body.textContent ?? '';
    for (const expected of [
      'Perfil LNS',
      'ChirpStack de prueba',
      'INV-000001 Sensor',
      '70B3D57ED0000001',
      '8877665544332211',
      'AppKey',
      '•••• (32 hex)',
      'Perfil AU915 · LoRaWAN 1.0.3 · AU915',
      'inventarius_asset_id = 018f0000-0000-7000-8000-000000000001',
      'Tenant',
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(text).not.toContain('NwkKey'); // solo en LoRaWAN 1.1
    expect(text).not.toContain('A1B2C3D4E5F6');
  });

  it('el botón de confirmar es el único que encola: sin confirmar no se llama al registro', async () => {
    const w = await openWith(preview());
    const posts = () =>
      w.fetchMock.mock.calls.filter(
        ([u, i]) => String(u).endsWith('/lns-registration') && i?.method === 'POST',
      );
    expect(posts()).toHaveLength(0);
    expect(confirmButton().textContent).toContain('Confirmar y registrar');
  });
});

describe('RegisterLnsDialog: coherencia con el device profile (P2)', () => {
  it('con datos que calzan se puede confirmar', async () => {
    await openWith(preview());
    expect(confirmButton().disabled).toBe(false);
  });

  it('si versión, clase o región difieren explica qué y no deja confirmar, con el motivo', async () => {
    await openWith(
      preview({
        mismatches: [
          { field: 'region', asset: 'AU915', lns: 'EU868' },
          { field: 'lorawanVersion', asset: '1.0.3', lns: '1.1' },
          { field: 'deviceClass', asset: 'C', lns: 'A' },
        ],
      }),
    );
    const text = document.body.textContent ?? '';
    expect(text).toContain('no coincide con el device profile');
    expect(text).toContain('Región: el activo tiene AU915 y el device profile EU868');
    expect(text).toContain('Versión de LoRaWAN: el activo tiene 1.0.3 y el device profile 1.1');
    expect(text).toContain('Clase: el activo tiene C y el device profile admite A');
    const button = confirmButton();
    expect(button.disabled).toBe(true);
    expect(button.className).not.toMatch(/primary/);
    expect(document.body.textContent).toContain(
      'Corrige el activo o elige otro perfil para poder registrar',
    );
  });

  it('si el servidor rechaza por diferencias (422), muestra cada explicación', async () => {
    await openWith(preview(), () =>
      jsonResponse(
        {
          type: 'https://inventarius.local/problems/validation',
          title: 'Datos inválidos',
          status: 422,
          detail: 'El activo no coincide con el device profile del LNS',
          errors: { region: ['La región del activo (AU915) no coincide con EU868'] },
        },
        422,
      ),
    );
    confirmButton().click();
    await flushPromises();
    expect(document.body.textContent).toContain(
      'La región del activo (AU915) no coincide con EU868',
    );
  });
});
