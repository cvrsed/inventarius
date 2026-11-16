import type { Permission } from '@inventarius/shared';
import type { Pinia } from 'pinia';
import type { Router } from 'vue-router';
import { useAuthStore } from '@/features/auth/useAuthStore';

declare module 'vue-router' {
  interface RouteMeta {
    /** Accesible sin sesión (login). */
    public?: boolean;
    /** Basta uno de estos permisos. */
    permissions?: Permission[];
    /** Usable con contraseña temporal (la pantalla de cambio). */
    allowPendingPassword?: boolean;
    /** Layout sin menú (login, cambio forzado de contraseña). */
    bare?: boolean;
  }
}

/** Autenticación y permisos de navegación. Es comodidad de UX: el backend valida cada petición igualmente. */
export function installGuards(router: Router, pinia: Pinia): void {
  router.beforeEach(async (to) => {
    const auth = useAuthStore(pinia);
    if (!auth.ready) await auth.load();

    if (to.meta.public) {
      return auth.isAuthenticated ? { name: 'home' } : true;
    }
    if (!auth.user) {
      return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} };
    }
    if (auth.user.mustChangePassword && !to.meta.allowPendingPassword) {
      return { name: 'change-password' };
    }
    if (to.meta.permissions && !auth.canAny(to.meta.permissions)) {
      return { name: 'forbidden' };
    }
    return true;
  });
}
