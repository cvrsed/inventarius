import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { installGuards } from './guards';

const Dummy = { template: '<div />' };

function setup(user: Parameters<typeof makeUser>[0] | null) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.ready = true;
  auth.user = user ? makeUser(user) : null;
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Dummy },
      { path: '/login', name: 'login', component: Dummy, meta: { public: true } },
      {
        path: '/cambiar-contrasena',
        name: 'change-password',
        component: Dummy,
        meta: { allowPendingPassword: true },
      },
      {
        path: '/usuarios',
        name: 'users',
        component: Dummy,
        meta: { permissions: ['user:manage'] },
      },
      { path: '/sin-permiso', name: 'forbidden', component: Dummy },
    ],
  });
  installGuards(router, pinia);
  return router;
}

function makeUser(o: { permissions?: string[]; mustChangePassword?: boolean }) {
  return {
    id: '018f0000-0000-7000-8000-000000000001',
    email: 'a@b.cl',
    name: 'A',
    mustChangePassword: o.mustChangePassword ?? false,
    roles: [],
    permissions: (o.permissions ?? []) as never,
  };
}

beforeEach(() => setActivePinia(createPinia()));

describe('guards del router', () => {
  it('anónimo es enviado al login recordando a dónde iba', async () => {
    const router = setup(null);
    await router.push('/usuarios');
    expect(router.currentRoute.value.name).toBe('login');
    expect(router.currentRoute.value.query['redirect']).toBe('/usuarios');
  });

  it('un usuario autenticado no ve el login', async () => {
    const router = setup({});
    await router.push('/login');
    expect(router.currentRoute.value.name).toBe('home');
  });

  it('sin el permiso de la ruta va a «sin permiso»', async () => {
    const router = setup({ permissions: ['asset:read'] });
    await router.push('/usuarios');
    expect(router.currentRoute.value.name).toBe('forbidden');
  });

  it('con el permiso entra', async () => {
    const router = setup({ permissions: ['user:manage'] });
    await router.push('/usuarios');
    expect(router.currentRoute.value.name).toBe('users');
  });

  it('con contraseña temporal solo puede ir a cambiarla', async () => {
    const router = setup({ mustChangePassword: true });
    await router.push('/');
    expect(router.currentRoute.value.name).toBe('change-password');
  });
});
