import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCsrfToken } from '@/shared/api/http';
import { globalPlugins } from '@/test-utils';
import LoginPage from './LoginPage.vue';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

beforeEach(() => {
  resetCsrfToken();
  vi.stubGlobal('fetch', vi.fn());
});

async function fill(wrapper: ReturnType<typeof mount>, email: string, password: string) {
  await wrapper.get('#login-email').setValue(email);
  await wrapper.get('input[type="password"]').setValue(password);
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}

describe('LoginPage', () => {
  it('valida el correo antes de llamar a la API', async () => {
    const wrapper = mount(LoginPage, { global: globalPlugins() });
    await fill(wrapper, 'no-es-correo', 'x');
    expect(wrapper.text()).toContain('Ingresa un correo válido');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor con role=alert y vacía la contraseña', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ token: 't' }))
      .mockResolvedValueOnce(
        json(
          {
            type: 'x',
            title: 'No autenticado',
            status: 401,
            detail: 'Correo o contraseña incorrectos',
          },
          401,
        ),
      );
    const wrapper = mount(LoginPage, { global: globalPlugins() });
    await fill(wrapper, 'ana@ejemplo.cl', 'clave-incorrecta-1');
    expect(wrapper.get('[role="alert"]').text()).toContain('Correo o contraseña incorrectos');
    expect((wrapper.get('input[type="password"]').element as HTMLInputElement).value).toBe('');
  });

  it('informa cuántos minutos esperar cuando la cuenta está bloqueada', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ token: 't' }))
      .mockResolvedValueOnce(
        json({ type: 'x', title: 'Demasiados intentos', status: 429, detail: 'x' }, 429, {
          'retry-after': '125',
        }),
      );
    const wrapper = mount(LoginPage, { global: globalPlugins() });
    await fill(wrapper, 'ana@ejemplo.cl', 'clave-incorrecta-1');
    expect(wrapper.text()).toContain('3 min');
  });
});
