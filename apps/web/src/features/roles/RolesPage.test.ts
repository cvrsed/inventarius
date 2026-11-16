import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import RolesPage from './RolesPage.vue';

afterEach(() => vi.unstubAllGlobals());

const role = (over: Record<string, unknown>) => ({
  id: '018f0000-0000-7000-8000-000000000001',
  name: 'Operador',
  description: 'Opera',
  isSystem: true,
  isProtected: false,
  permissions: ['asset:read', 'asset:write'],
  userCount: 2,
  updatedAt: '2026-11-16T12:00:00.000Z',
  ...over,
});
const catalog = ['asset:read', 'asset:write', 'audit:read'];

describe('RolesPage', () => {
  it('lista roles, marca los del sistema y solo permite borrar los propios', async () => {
    mockApi({
      'GET /api/v1/roles': () => [
        role({}),
        role({ id: '018f0000-0000-7000-8000-000000000002', name: 'Auditor', isSystem: false }),
      ],
      'GET /api/v1/permissions': () => catalog,
    });
    const w = mount(RolesPage, { global: pagePlugins() });
    await flushPromises();
    expect(w.text()).toContain('Operador');
    expect(w.text()).toContain('Del sistema');
    expect(w.find('button[aria-label="Eliminar Operador"]').exists()).toBe(false);
    expect(w.find('button[aria-label="Eliminar Auditor"]').exists()).toBe(true);
    expect(w.find('button[aria-label="Editar Operador"]').exists()).toBe(true);
  });

  it('muestra error con reintento si falla la carga', async () => {
    mockApi({ 'GET /api/v1/roles': () => jsonResponse({}, 500) });
    const w = mount(RolesPage, { global: pagePlugins() });
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('Reintentar');
  });

  it('crear un rol exige nombre y envía los permisos elegidos', async () => {
    let created: unknown;
    mockApi({
      'GET /api/v1/roles': () => [],
      'GET /api/v1/permissions': () => catalog,
      'POST /api/v1/roles': (init) => {
        created = JSON.parse(String(init?.body));
        return jsonResponse(role({ name: 'Nuevo', isSystem: false }), 201);
      },
    });
    const w = mount(RolesPage, { global: pagePlugins(), attachTo: document.body });
    await flushPromises();
    await w.get('button.p-button').trigger('click');
    await flushPromises();
    const form = document.body.querySelector('#role-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();
    expect(document.body.textContent).toContain('Este campo es obligatorio');
    expect(created).toBeUndefined();

    const name = document.body.querySelector('#r-name') as HTMLInputElement;
    name.value = 'Nuevo';
    name.dispatchEvent(new Event('input'));
    (document.body.querySelector('#perm-audit\\:read') as HTMLInputElement).click();
    await flushPromises();
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flushPromises();
    expect(created).toMatchObject({ name: 'Nuevo', permissions: ['audit:read'] });
    w.unmount();
  });
});
