import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import PrimeVue from 'primevue/config';
import { createPinia } from 'pinia';
import type { GlobalMountOptions } from '@vue/test-utils';
import { createAppI18n } from '@/app/i18n';
import { router } from '@/app/router';

/** Plugins globales para montar componentes en tests, igual que `main.ts` pero sin tema. */
export function globalPlugins(): GlobalMountOptions {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    plugins: [
      createPinia(),
      router,
      createAppI18n(),
      [VueQueryPlugin, { queryClient }],
      [PrimeVue, { theme: 'none' }],
    ],
  };
}
