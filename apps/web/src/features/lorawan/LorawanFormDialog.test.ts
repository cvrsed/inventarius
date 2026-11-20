import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LorawanDto } from '@inventarius/shared';
import AppSelect from '@/shared/ui/AppSelect.vue';
import { mockApi, pagePlugins } from '@/test-utils';
import LorawanFormDialog from './LorawanFormDialog.vue';

const mounted: { unmount: () => void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount());
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const data = (status: string | null, origin = 'created'): LorawanDto =>
  ({
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
    registration: status
      ? {
          status,
          profile: { id: '018f0000-0000-7000-8000-0000000000aa', name: 'CS', kind: 'chirpstack' },
          externalId: '70b3d57ed0000001',
          origin,
          lastError: null,
          orphans: [],
          attempts: 1,
          registeredAt: null,
          updatedAt: '2026-11-19T12:00:00.000Z',
        }
      : null,
  }) as unknown as LorawanDto;

async function open(dto: LorawanDto) {
  mockApi({});
  const w = mount(LorawanFormDialog, {
    props: { assetId: 'a1', data: dto, visible: true },
    global: pagePlugins(),
    attachTo: document.body,
  });
  mounted.push(w);
  await flushPromises();
  return w;
}

const input = (id: string) => document.body.querySelector<HTMLInputElement>(`#${id}`)!;

describe('LorawanFormDialog (P2)', () => {
  it.each([
    ['registrado por Inventarius', 'registered', 'created'],
    ['vinculado', 'registered', 'linked'],
    ['parcial', 'partial', 'created'],
  ])(
    'con el dispositivo %s, DevEUI, JoinEUI y claves quedan bloqueados',
    async (_n, status, origin) => {
      await open(data(status, origin));
      expect(input('lw-deveui').disabled).toBe(true);
      expect(input('lw-joineui').disabled).toBe(true);
      expect(document.body.textContent).toContain(
        'dar de baja (o desvincular) y volver a registrar',
      );
    },
  );

  it('sin registro se editan con libertad y no hay avisos', async () => {
    await open(data(null));
    expect(input('lw-deveui').disabled).toBe(false);
    expect(document.body.textContent).not.toContain('el LNS no se actualiza');
  });

  it('editar versión, clase o región de un registrado avisa que el LNS no se actualiza', async () => {
    const w = await open(data('registered'));
    expect(document.body.textContent).not.toContain('el LNS no se actualiza');
    const selects = w.findAllComponents(AppSelect);
    selects[0]!.vm.$emit('update:modelValue', 'C');
    await flushPromises();
    expect(document.body.textContent).toContain('el LNS no se actualiza');
    expect(document.body.textContent).toContain('device profile');
  });

  it('el aviso no sale en un dispositivo sin registrar aunque se edite', async () => {
    const w = await open(data(null));
    w.findAllComponents(AppSelect)[0]!.vm.$emit('update:modelValue', 'C');
    await flushPromises();
    expect(document.body.textContent).not.toContain('el LNS no se actualiza');
  });
});
