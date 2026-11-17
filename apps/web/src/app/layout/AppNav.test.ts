import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { router } from '@/app/router';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { globalPlugins, mockApi } from '@/test-utils';
import AppNav from './AppNav.vue';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

async function mountNav(orientation: 'vertical' | 'horizontal', permissions: string[]) {
  mockApi({});
  await router.push('/');
  const global = globalPlugins();
  const w = mount(AppNav, { props: { orientation }, global, attachTo: document.body });
  useAuthStore().user = {
    id: '018f0000-0000-7000-8000-000000000001',
    email: 'ana@ejemplo.cl',
    name: 'Ana',
    mustChangePassword: false,
    roles: [],
    permissions: permissions as never,
  };
  await flushPromises();
  return w;
}
const ADMIN = ['asset:read', 'user:manage', 'role:manage', 'audit:read'];

describe('AppNav móvil (barra inferior)', () => {
  it('lleva solo Inicio, Activos, Catálogo y Más', async () => {
    const w = await mountNav('horizontal', ADMIN);
    const labels = w.findAll('nav li').map((li) => li.text());
    expect(labels).toEqual(['Inicio', 'Activos', 'Catálogo', 'Más']);
    w.unmount();
  });

  it('un rol sin permisos de administración ve solo lo que puede usar', async () => {
    const w = await mountNav('horizontal', []);
    expect(w.findAll('nav li').map((li) => li.text())).toEqual(['Inicio', 'Más']);
    w.unmount();
  });

  it('«Más» abre un panel con Usuarios, Roles, Auditoría y las acciones de cuenta', async () => {
    const w = await mountNav('horizontal', ADMIN);
    await w.get('button[aria-haspopup="dialog"]').trigger('click');
    await flushPromises();
    const text = document.body.textContent ?? '';
    for (const label of [
      'Usuarios',
      'Roles',
      'Auditoría',
      'Cambiar contraseña',
      'Cambiar a modo oscuro',
      'Cerrar sesión',
    ])
      expect(text).toContain(label);
    w.unmount();
  });

  it('el panel solo ofrece los destinos permitidos', async () => {
    const w = await mountNav('horizontal', ['audit:read']);
    await w.get('button[aria-haspopup="dialog"]').trigger('click');
    await flushPromises();
    const links = [...document.body.querySelectorAll('nav[aria-label="Otras secciones"] a')].map(
      (a) => a.textContent?.trim(),
    );
    expect(links).toEqual(['Auditoría']);
    w.unmount();
  });
});

describe('AppNav escritorio', () => {
  it('lista todos los destinos permitidos en la barra lateral', async () => {
    const w = await mountNav('vertical', ADMIN);
    expect(w.findAll('nav a').map((a) => a.text())).toEqual([
      'Inicio',
      'Activos',
      'Catálogo',
      'Usuarios',
      'Roles',
      'Auditoría',
    ]);
    w.unmount();
  });
});
