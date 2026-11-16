import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import ui from '@nuxt/ui/vue-plugin';
import { vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { GlobalMountOptions } from '@vue/test-utils';
import { createAppI18n } from '@/app/i18n';
import { router } from '@/app/router';

/** Plugins globales para montar componentes en tests, igual que `main.ts` pero sin tema. */
export function globalPlugins(): GlobalMountOptions {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pinia = createPinia();
  // Activo para que `useXStore()` en el test vea la misma instancia que el componente montado.
  setActivePinia(pinia);
  return {
    plugins: [pinia, router, createAppI18n(), [VueQueryPlugin, { queryClient }], ui],
  };
}

type Handler = (init: RequestInit | undefined, url: string) => Response | object;

/**
 * Reemplaza `fetch` por un enrutador por «MÉTODO ruta»; el CSRF se responde solo.
 * Devuelve el mock para inspeccionar llamadas.
 */
export function mockApi(routes: Record<string, Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = url.split('?')[0]!;
    if (path === '/api/v1/auth/csrf') return jsonResponse({ token: 'test-token' });
    const key = `${init?.method ?? 'GET'} ${path}`;
    const handler = routes[key];
    if (!handler) return jsonResponse({ title: `sin mock: ${key}`, status: 500 }, 500);
    const out = handler(init, url);
    return out instanceof Response ? out : jsonResponse(out);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** Plugins globales para pantallas con diálogos y avisos: los monta `UApp`, que aporta toasts y overlays. */
export function pagePlugins(): GlobalMountOptions {
  return globalPlugins();
}
