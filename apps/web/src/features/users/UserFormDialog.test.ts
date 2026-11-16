import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import UserFormDialog from './UserFormDialog.vue';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const roleId = '018f0000-0000-7000-8000-0000000000aa';
const role = {
  id: roleId,
  name: 'Lector',
  description: '',
  isSystem: true,
  isProtected: false,
  permissions: ['asset:read'],
  userCount: 1,
  updatedAt: '2026-11-16T12:00:00.000Z',
};
const user = {
  id: '018f0000-0000-7000-8000-000000000001',
  email: 'ana@ejemplo.cl',
  name: 'Ana',
  active: true,
  mustChangePassword: false,
  roles: [{ id: roleId, name: 'Lector' }],
  createdAt: '2026-11-16T12:00:00.000Z',
  updatedAt: '2026-11-16T12:00:00.000Z',
};

const submit = async () => {
  (document.body.querySelector('#user-form') as HTMLFormElement).dispatchEvent(
    new Event('submit', { cancelable: true }),
  );
  await flushPromises();
};
const type = (selector: string, value: string) => {
  const el = document.body.querySelector(selector) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input'));
};

function open(props: { user: typeof user | null; creating: boolean }, currentUserId?: string) {
  const global = pagePlugins();
  if (currentUserId) {
    useAuthStore().user = {
      id: currentUserId,
      email: 'yo@ejemplo.cl',
      name: 'Yo',
      mustChangePassword: false,
      roles: ['Administrador'],
      permissions: ['user:manage'],
    };
  }
  return mount(UserFormDialog, {
    props: { ...props, visible: true },
    global,
    attachTo: document.body,
  });
}

describe('UserFormDialog', () => {
  it('al crear valida nombre, correo, contraseña y rol antes de llamar a la API', async () => {
    const fetchMock = mockApi({ 'GET /api/v1/roles': () => [role] });
    const w = open({ user: null, creating: true });
    await flushPromises();
    await submit();
    expect(document.body.textContent).toContain('Ingresa un correo válido');
    expect(document.body.textContent).toContain('Debe tener al menos 12 caracteres');
    expect(
      fetchMock.mock.calls.some((c) => (c[1] as RequestInit | undefined)?.method === 'POST'),
    ).toBe(false);
    w.unmount();
  });

  it('al editar a otro usuario el correo es editable y se envía al cambiarlo', async () => {
    const bodies: Record<string, unknown>[] = [];
    mockApi({
      'GET /api/v1/roles': () => [role],
      'PATCH /api/v1/users/018f0000-0000-7000-8000-000000000001': (init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return user;
      },
    });
    const w = open({ user, creating: false }, '018f0000-0000-7000-8000-0000000000ff');
    await flushPromises();
    expect((document.body.querySelector('#u-email') as HTMLInputElement).disabled).toBe(false);
    type('#u-email', 'ana.nueva@ejemplo.cl');
    await submit();
    expect(bodies[0]).toMatchObject({ email: 'ana.nueva@ejemplo.cl' });
    w.unmount();
  });

  it('al editar su propio usuario el correo queda de solo lectura con una explicación', async () => {
    mockApi({ 'GET /api/v1/roles': () => [role] });
    const w = open({ user, creating: false }, user.id);
    await flushPromises();
    expect((document.body.querySelector('#u-email') as HTMLInputElement).disabled).toBe(true);
    expect(document.body.textContent).toContain('No puedes cambiar tu propio correo');
    w.unmount();
  });

  it('al editar envía PATCH con If-Match igual al updatedAt y sin tocar el correo', async () => {
    let headers: Record<string, string> = {};
    let body: unknown;
    mockApi({
      'GET /api/v1/roles': () => [role],
      'PATCH /api/v1/users/018f0000-0000-7000-8000-000000000001': (init) => {
        headers = init?.headers as Record<string, string>;
        body = JSON.parse(String(init?.body));
        return { ...user, name: 'Ana María' };
      },
    });
    const w = open({ user, creating: false });
    await flushPromises();
    type('#u-name', 'Ana María');
    await submit();
    expect(headers['if-match']).toBe(`"${user.updatedAt}"`);
    expect(body).toMatchObject({ name: 'Ana María', active: true, roleIds: [roleId] });
    expect(body).not.toHaveProperty('email');
    w.unmount();
  });

  it('muestra los errores por campo que devuelve el servidor', async () => {
    mockApi({
      'GET /api/v1/roles': () => [role],
      'PATCH /api/v1/users/018f0000-0000-7000-8000-000000000001': () =>
        jsonResponse(
          {
            type: 'x',
            title: 'Datos inválidos',
            status: 422,
            errors: { roleIds: ['Rol inexistente'] },
          },
          422,
        ),
    });
    const w = open({ user, creating: false });
    await flushPromises();
    await submit();
    expect(document.body.textContent).toContain('Rol inexistente');
    w.unmount();
  });

  it('ante un conflicto de versión (412) avisa que el registro cambió y cierra el diálogo', async () => {
    mockApi({
      'GET /api/v1/roles': () => [role],
      'PATCH /api/v1/users/018f0000-0000-7000-8000-000000000001': () =>
        jsonResponse({ type: 'x', title: 'El recurso cambió', status: 412, detail: 'cambió' }, 412),
    });
    const w = open({ user, creating: false });
    await flushPromises();
    await submit();
    expect(w.emitted('update:visible')?.at(-1)).toEqual([false]);
    w.unmount();
  });
});
