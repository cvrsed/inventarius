import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCsrfToken } from '@/shared/api/http';
import { jsonResponse, mockApi, pagePlugins } from '@/test-utils';
import ChangePasswordPage from './ChangePasswordPage.vue';
import { useAuthStore } from './useAuthStore';

const me = {
  id: '018f0000-0000-7000-8000-000000000001',
  email: 'a@b.cl',
  name: 'Ana',
  mustChangePassword: true,
  roles: [],
  permissions: [],
};

beforeEach(() => {
  resetCsrfToken();
});

async function fill(w: ReturnType<typeof mount>, current: string, next: string, confirm: string) {
  const inputs = w.findAll('input[type="password"]');
  await inputs[0]!.setValue(current);
  await inputs[1]!.setValue(next);
  await inputs[2]!.setValue(confirm);
  await w.get('form').trigger('submit');
  await flushPromises();
}

describe('ChangePasswordPage', () => {
  it('valida largo mínimo y coincidencia sin llamar a la API', async () => {
    const fetchMock = mockApi({});
    const w = mount(ChangePasswordPage, { global: pagePlugins() });
    await fill(w, 'actual', 'corta', 'corta');
    expect(w.text()).toContain('Debe tener al menos 12 caracteres');
    await fill(w, 'actual', 'una-clave-larga-1', 'otra-clave-larga-2');
    expect(w.text()).toContain('Las contraseñas no coinciden');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('muestra el aviso de contraseña temporal y los errores por campo del servidor', async () => {
    mockApi({
      'POST /api/v1/auth/change-password': () =>
        jsonResponse(
          {
            type: 'x',
            title: 'Datos inválidos',
            status: 422,
            errors: { currentPassword: ['La contraseña actual no es correcta'] },
          },
          422,
        ),
    });
    const w = mount(ChangePasswordPage, { global: pagePlugins() });
    useAuthStore().user = me;
    await flushPromises();
    expect(w.text()).toContain('Tu contraseña es temporal');
    await fill(w, 'incorrecta', 'una-clave-larga-1', 'una-clave-larga-1');
    expect(w.text()).toContain('La contraseña actual no es correcta');
  });

  it('al cambiarla actualiza la sesión', async () => {
    mockApi({ 'POST /api/v1/auth/change-password': () => ({ ...me, mustChangePassword: false }) });
    const w = mount(ChangePasswordPage, { global: pagePlugins() });
    const auth = useAuthStore();
    auth.user = me;
    await fill(w, 'actual-clave-1', 'una-clave-larga-1', 'una-clave-larga-1');
    expect(auth.user?.mustChangePassword).toBe(false);
  });
});
