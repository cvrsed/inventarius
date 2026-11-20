import type { Permission } from '@inventarius/shared';

/** Entradas de la navegación principal; el router y los textos se resuelven por nombre y clave i18n. */
export interface NavigationItem {
  routeName: string;
  /** Ruta de destino; la entrada está activa en ella y en sus subrutas. */
  path: string;
  labelKey: string;
  icon: string;
  /** `primary` va en la barra inferior móvil; `more` queda dentro del panel «Más». */
  placement: 'primary' | 'more';
  /** Se muestra si el usuario tiene al menos uno; sin lista, a todos. */
  permissions?: Permission[];
}

export const navigationItems: readonly NavigationItem[] = [
  {
    routeName: 'home',
    placement: 'primary',
    path: '/',
    labelKey: 'nav.home',
    icon: 'i-lucide-house',
  },
  {
    routeName: 'assets',
    placement: 'primary',
    path: '/activos',
    labelKey: 'nav.assets',
    icon: 'i-lucide-package',
    permissions: ['asset:read'],
  },
  {
    routeName: 'catalog',
    placement: 'primary',
    path: '/catalogo/categories',
    labelKey: 'nav.catalog',
    icon: 'i-lucide-library',
    permissions: ['asset:read', 'consumables:read'],
  },
  {
    routeName: 'users',
    placement: 'more',
    path: '/usuarios',
    labelKey: 'nav.users',
    icon: 'i-lucide-users',
    permissions: ['user:manage'],
  },
  {
    routeName: 'roles',
    placement: 'more',
    path: '/roles',
    labelKey: 'nav.roles',
    icon: 'i-lucide-shield',
    permissions: ['role:manage'],
  },
  {
    routeName: 'lns-profiles',
    placement: 'more',
    path: '/perfiles-lns',
    labelKey: 'nav.lnsProfiles',
    icon: 'i-lucide-radio-tower',
    permissions: ['lns_profile:manage'],
  },
  {
    routeName: 'audit',
    placement: 'more',
    path: '/auditoria',
    labelKey: 'nav.audit',
    icon: 'i-lucide-history',
    permissions: ['audit:read'],
  },
];
