import { VueQueryPlugin } from '@tanstack/vue-query';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import 'primeicons/primeicons.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppI18n } from './app/i18n';
import { router } from './app/router';
import { useThemeStore } from './features/theme/useThemeStore';
import { InventariusPreset } from './theme/preset';
import './styles/main.css';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(createAppI18n());
app.use(VueQueryPlugin);
app.use(ToastService);
app.use(PrimeVue, {
  theme: {
    preset: InventariusPreset,
    options: {
      darkModeSelector: '.app-dark',
      cssLayer: { name: 'primevue', order: 'theme, base, primevue' },
    },
  },
});

useThemeStore(pinia).init();
app.mount('#app');
