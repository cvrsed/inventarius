import { flushPromises, mount } from '@vue/test-utils';
import type { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetDto, LorawanDto, Permission } from '@inventarius/shared';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { mockApi, pagePlugins } from '@/test-utils';
import { useConfirm } from '@/shared/ui/useConfirm';
import LorawanSection from './LorawanSection.vue';

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});

const ID = '018f0000-0000-7000-8000-000000000001';
const asset = { id: ID, deleted: false } as unknown as AssetDto;
const PROFILE = '018f0000-0000-7000-8000-0000000000aa';

const PREVIEW = {
  deviceName: 'INV-000001 Sensor',
  description: 'Sensor',
  externalId: '70b3d57ed0000001',
  devEui: '70B3D57ED0000001',
  joinEui: '8877665544332211',
  appKey: '•'.repeat(32),
  nwkKey: null,
  deviceClass: 'A',
  lorawanVersion: '1.0.3',
  region: 'AU915',
  tags: [{ key: 'inventarius_asset_id', value: ID }],
  target: {},
  deviceProfile: { name: 'Perfil AU915', version: 'LoRaWAN 1.0.3', region: 'AU915' },
  mismatches: [],
};

const data = (over: Partial<LorawanDto> = {}): LorawanDto => ({
  devEui: '70B3D57ED0000001',
  joinEui: '8877665544332211',
  hasAppKey: true,
  hasNwkKey: false,
  activation: 'OTAA',
  deviceClass: 'A',
  lorawanVersion: '1.0.3',
  region: 'AU915',
  modelDefaults: { deviceClass: 'A', lorawanVersion: '1.0.3', region: 'AU915' },
  missingForRegistration: [],
  registration: null,
  ...over,
});

const registration = (status: string, extra: Record<string, unknown> = {}) => ({
  status,
  profile: { id: PROFILE, name: 'ChirpStack de prueba', kind: 'chirpstack' },
  externalId: null,
  origin: 'created',
  lastError: null,
  orphans: [],
  attempts: 1,
  registeredAt: null,
  updatedAt: '2026-11-19T12:00:00.000Z',
  ...extra,
});

async function mountSection(permissions: Permission[], lorawan: LorawanDto) {
  const fetchMock = mockApi({
    [`GET /api/v1/assets/${ID}/lorawan`]: () => lorawan,
    'GET /api/v1/lns-profiles/options': () => [
      { id: PROFILE, name: 'ChirpStack de prueba', kind: 'chirpstack' },
    ],
    [`POST /api/v1/assets/${ID}/lns-registration/preview`]: () => ({
      profile: { id: PROFILE, name: 'ChirpStack de prueba', kind: 'chirpstack' },
      ...PREVIEW,
    }),
    [`POST /api/v1/assets/${ID}/lorawan/reveal`]: () => ({
      appKey: 'A1B2C3D4E5F60718293A4B5C6D7E8F90',
      nwkKey: null,
    }),
  });
  const global = pagePlugins();
  const auth = useAuthStore(global.plugins![0] as ReturnType<typeof createPinia>);
  auth.user = {
    id: '018f0000-0000-7000-8000-0000000000ff',
    email: 'x@y.cl',
    name: 'X',
    mustChangePassword: false,
    roles: [],
    permissions,
  };
  const wrapper = mount(LorawanSection, { props: { asset }, global, attachTo: document.body });
  mounted.push(wrapper);
  await flushPromises();
  return Object.assign(wrapper, { fetchMock });
}

const labels = (w: Awaited<ReturnType<typeof mountSection>>) =>
  w
    .findAll('button')
    .map((b) => b.text().trim())
    .filter(Boolean);

describe('LorawanSection (RF-21, RF-41, RF-60)', () => {
  it('sin lorawan:read no se muestra ni pide nada', async () => {
    const w = await mountSection(['asset:read'], data());
    expect(w.find('[data-testid="lorawan-section"]').exists()).toBe(false);
    expect(w.fetchMock.mock.calls.some(([u]) => String(u).includes('/lorawan'))).toBe(false);
  });

  it('un lector ve los datos y el estado, sin acciones y sin las claves', async () => {
    const w = await mountSection(['asset:read', 'lorawan:read'], data());
    expect(w.text()).toContain('70B3D57ED0000001');
    expect(w.text()).toContain('No registrado');
    expect(w.text()).toContain('Guardada (cifrada)');
    expect(labels(w)).toEqual([]);
  });

  it('un técnico ve Registrar en LNS; un operador, además, editar; solo quien puede revelar ve «Mostrar claves»', async () => {
    const tech = await mountSection(['lorawan:read', 'lorawan:register'], data());
    expect(labels(tech)).toEqual(['Registrar en LNS']);
    const op = await mountSection(['lorawan:read', 'lorawan:register', 'asset:write'], data());
    expect(labels(op)).toEqual(
      expect.arrayContaining(['Registrar en LNS', 'Editar datos LoRaWAN']),
    );
    expect(labels(op)).not.toContain('Mostrar claves');
    const admin = await mountSection(
      ['lorawan:read', 'lorawan:register', 'asset:write', 'lorawan:keys:reveal'],
      data(),
    );
    expect(labels(admin)).toContain('Mostrar claves');
  });

  it('Registrar en LNS queda deshabilitado y explica qué falta si los datos están incompletos', async () => {
    const w = await mountSection(
      ['lorawan:read', 'lorawan:register'],
      data({ devEui: null, hasAppKey: false, missingForRegistration: ['devEui', 'appKey'] }),
    );
    const button = w.findAll('button').find((b) => b.text() === 'Registrar en LNS')!;
    expect(button.attributes('disabled')).toBeDefined();
    expect(w.text()).toContain('faltan: DevEUI, AppKey');
    expect(button.classes().join(' ')).not.toMatch(/primary/);
    expect(w.get(`#${CSS.escape(button.attributes('aria-describedby')!)}`).text()).toContain(
      'faltan: DevEUI, AppKey',
    );
  });

  it('según el estado ofrece reintentar, vincular/cancelar o dar de baja', async () => {
    const perms: Permission[] = ['lorawan:read', 'lorawan:register'];
    const error = await mountSection(
      perms,
      data({
        registration: registration('error', { lastError: 'ChirpStack rechazó los datos' }) as never,
      }),
    );
    expect(labels(error)).toEqual(['Reintentar']);
    expect(error.text()).toContain('ChirpStack rechazó los datos');
    const conflict = await mountSection(
      perms,
      data({ registration: registration('conflict') as never }),
    );
    expect(labels(conflict)).toEqual(['Vincular', 'Cancelar registro']);
    const done = await mountSection(
      perms,
      data({
        registration: registration('registered', { externalId: '70b3d57ed0000001' }) as never,
      }),
    );
    expect(labels(done)).toEqual(['Dar de baja en LNS']);
    expect(done.text()).toContain('70b3d57ed0000001');
    const busy = await mountSection(
      perms,
      data({ registration: registration('registering') as never }),
    );
    expect(labels(busy)).toEqual([]);
    expect(busy.text()).toContain('Registrando…');
  });

  it('un registro parcial muestra qué quedó huérfano en el LNS', async () => {
    const w = await mountSection(
      ['lorawan:read', 'lorawan:register'],
      data({ registration: registration('partial', { orphans: ['js', 'is'] }) as never }),
    );
    expect(w.text()).toContain('Join Server, Identity Server');
    expect(labels(w)).toEqual(expect.arrayContaining(['Reintentar', 'Dar de baja en LNS']));
  });

  it('el diálogo de registro pide la vista previa al elegir el perfil y no muestra claves', async () => {
    const w = await mountSection(['lorawan:read', 'lorawan:register'], data());
    await w
      .findAll('button')
      .find((b) => b.text() === 'Registrar en LNS')!
      .trigger('click');
    await flushPromises();
    const select = document.body.querySelector('#reg-profile');
    expect(select).not.toBeNull();
    expect(document.body.textContent).toContain('Registrar en el LNS');
    expect(document.body.textContent).not.toContain('A1B2C3D4E5F6');
  });

  it('revelar pide confirmación primero; después muestra la clave y al cerrar la descarta', async () => {
    const w = await mountSection(['lorawan:read', 'lorawan:keys:reveal'], data());
    await w
      .findAll('button')
      .find((b) => b.text() === 'Mostrar claves')!
      .trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('queda registrado en la auditoría');
    expect(document.body.querySelector('[data-testid="revealed-key"]')).toBeNull();
    const confirmBtn = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Mostrar',
    )!;
    confirmBtn.click();
    await flushPromises();
    expect(document.body.querySelector('[data-testid="revealed-key"]')?.textContent).toBe(
      'A1B2C3D4E5F60718293A4B5C6D7E8F90',
    );
    const hide = [...document.body.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Ocultar',
    )!;
    hide.click();
    await flushPromises();
    expect(document.body.querySelector('[data-testid="revealed-key"]')).toBeNull();
  });

  it('en conflicto el mensaje sale una sola vez', async () => {
    const message = 'El DevEUI ya existe en el LNS y no lo creó Inventarius';
    const w = await mountSection(
      ['lorawan:read', 'lorawan:register'],
      data({ registration: registration('conflict', { lastError: message }) as never }),
    );
    expect(w.text().split('Ya hay un dispositivo con ese DevEUI').length - 1).toBe(1);
    expect(w.text()).not.toContain('Último error');
    expect(w.text()).not.toContain(message);
  });

  describe('desvincular un dispositivo que ya existía en el LNS (P7)', () => {
    const perms: Permission[] = ['lorawan:read', 'lorawan:register'];
    const linked = () =>
      data({
        registration: registration('registered', {
          origin: 'linked',
          externalId: '70b3d57ed0000001',
        }) as never,
      });

    it('el botón y su confirmación se llaman «Desvincular», sin estilo destructivo', async () => {
      const w = await mountSection(perms, linked());
      expect(labels(w)).toEqual(['Desvincular']);
      expect(labels(w)).not.toContain('Dar de baja en LNS');
      const button = w.findAll('button').find((b) => b.text() === 'Desvincular')!;
      expect(button.classes().join(' ')).not.toMatch(/error/);
      await button.trigger('click');
      const { options } = useConfirm().state;
      expect(options).toMatchObject({
        title: 'Desvincular',
        acceptLabel: 'Desvincular',
        danger: false,
      });
      expect(options!.message).toContain('no se borra nada en el LNS');
      useConfirm().close();
    });

    it('si Inventarius lo creó, sigue siendo «Dar de baja en LNS» y destructivo', async () => {
      const w = await mountSection(
        perms,
        data({ registration: registration('registered', { origin: 'created' }) as never }),
      );
      expect(labels(w)).toEqual(['Dar de baja en LNS']);
      const button = w.findAll('button').find((b) => b.text() === 'Dar de baja en LNS')!;
      await button.trigger('click');
      expect(useConfirm().state.options).toMatchObject({
        title: 'Dar de baja en LNS',
        danger: true,
      });
      useConfirm().close();
    });
  });
});
