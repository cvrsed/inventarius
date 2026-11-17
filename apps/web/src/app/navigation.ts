import type { Permission } from '@inventarius/shared';

/** Entradas de la navegación principal; el router y los textos se resuelven por nombre y clave i18n. */
export interface NavigationItem {
  routeName: string;
  /** Ruta de destino; la entrada está activa en ella y en sus subrutas. */
  path: string;
  labelKey: string;
  icon: string;
  /** Se muestra si el usuario tiene al menos uno; sin lista, a todos. */
  permissions?: Permission[];
}

export const navigationItems: readonly NavigationItem[] = [
  { routeName: 'home', path: '/', labelKey: 'nav.home', icon: 'i-lucide-house' },
  {
    routeName: 'assets',
    path: '/activos',
    labelKey: 'nav.assets',
    icon: 'i-lucide-package',
    permissions: ['asset:read'],
  },
  {
    routeName: 'catalog',
    path: '/catalogo/categories',
    labelKey: 'nav.catalog',
    icon: 'i-lucide-library',
    permissions: ['asset:read'],
  },
  {
    routeName: 'users',
    path: '/usuarios',
    labelKey: 'nav.users',
    icon: 'i-lucide-users',
    permissions: ['user:manage'],
  },
  {
    routeName: 'roles',
    path: '/roles',
    labelKey: 'nav.roles',
    icon: 'i-lucide-shield',
    permissions: ['role:manage'],
  },
  {
    routeName: 'audit',
    path: '/auditoria',
    labelKey: 'nav.audit',
    icon: 'i-lucide-history',
    permissions: ['audit:read'],
  },
];
