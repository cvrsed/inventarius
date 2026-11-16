/** Entradas de la navegación principal; el router y los textos se resuelven por nombre y clave i18n. */
export interface NavigationItem {
  routeName: string;
  labelKey: string;
  icon: string;
}

export const navigationItems: readonly NavigationItem[] = [
  { routeName: 'home', labelKey: 'nav.home', icon: 'pi pi-home' },
];
