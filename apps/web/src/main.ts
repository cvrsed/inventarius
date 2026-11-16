import { addAPIProvider } from '@iconify/vue';
import ui from '@nuxt/ui/vue-plugin';
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
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
app.use(router);
app.use(createAppI18n());
app.use(VueQueryPlugin);
app.use(ui);

installGuards(router, pinia);
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
