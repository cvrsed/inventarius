import type { Permission } from '@inventarius/shared';

/** Entradas de la navegación principal; el router y los textos se resuelven por nombre y clave i18n. */
export interface NavigationItem {
  routeName: string;
  labelKey: string;
  icon: string;
  /** Se muestra si el usuario tiene al menos uno; sin lista, a todos. */
  permissions?: Permission[];
}

export const navigationItems: readonly NavigationItem[] = [
  { routeName: 'home', labelKey: 'nav.home', icon: 'pi pi-home' },
  { routeName: 'users', labelKey: 'nav.users', icon: 'pi pi-users', permissions: ['user:manage'] },
  { routeName: 'roles', labelKey: 'nav.roles', icon: 'pi pi-shield', permissions: ['role:manage'] },
  { routeName: 'audit', labelKey: 'nav.audit', icon: 'pi pi-history', permissions: ['audit:read'] },
];
