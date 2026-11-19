import { addAPIProvider } from '@iconify/vue';
import ui from '@nuxt/ui/vue-plugin';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { useToast } from '@nuxt/ui/composables/useToast';
import { installErrorHandling } from './app/errorHandling';
import { createAppI18n } from './app/i18n';
import { router } from './app/router';
import { installGuards } from './app/guards';
import { useAuthStore } from './features/auth/useAuthStore';
import { setUnauthorizedHandler } from './shared/api/http';
import { useThemeStore } from './features/theme/useThemeStore';
import './styles/main.css';

// Los íconos van empaquetados en el build: sin proveedores, Iconify nunca consulta a api.iconify.design (RNF-08).
addAPIProvider('', { resources: [] });

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
const i18n = createAppI18n();
app.use(router);
app.use(i18n);
app.use(VueQueryPlugin);
app.use(ui);

installGuards(router, pinia);
// Una falla de render, de un evento o de la navegación se registra y se avisa; nunca queda la app congelada en silencio.
installErrorHandling(app, router, {
  notify: () =>
    app
      .runWithContext(() => useToast())
      .add({ title: i18n.global.t('errors.unexpected'), color: 'error', duration: 8000 }),
});
// Una sesión vencida a mitad de uso devuelve al login conservando la ruta actual.
setUnauthorizedHandler(() => {
  useAuthStore(pinia).clear();
  const current = router.currentRoute.value;
  if (current.name !== 'login') {
    void router.replace({ name: 'login', query: { redirect: current.fullPath } });
  }
});
useThemeStore(pinia).init();
app.mount('#app');
