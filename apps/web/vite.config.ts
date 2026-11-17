import ui from '@nuxt/ui/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defaultClientConditions } from 'vite';
import { defineConfig } from 'vitest/config';
import { APP_ICONS, uiDefaultVariants, uiTheme } from './src/theme/theme';

export default defineConfig({
  plugins: [
    vue(),
    ui({
      ui: uiTheme,
      theme: { defaultVariants: uiDefaultVariants },
      // Los componentes se importan de forma explícita: sin auto-import ni archivos .d.ts generados.
      components: false,
      autoImport: false,
      dts: false,
      // El modo claro/oscuro lo maneja `useThemeStore` (clase `dark` en <html>, preferencia en localStorage).
      colorMode: false,
      icon: { clientBundle: { icons: [...APP_ICONS], scan: false } },
    }),
  ],
  resolve: {
    conditions: ['inventarius-source', ...defaultClientConditions],
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Mismo origen en dev: el front llama a /api y Vite lo reenvía a la API.
    // `xfwd` hace que el proxy de dev informe la IP del cliente (X-Forwarded-For), como Caddy en producción.
    proxy: {
      '/api': { target: process.env['API_PROXY_TARGET'] ?? 'http://localhost:3000', xfwd: true },
    },
  },
  build: { target: 'es2023' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/**/*.test.ts',
        'src/test-setup.ts',
        'src/test-utils.ts',
        'src/main.ts',
        'src/env.d.ts',
      ],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 60 },
    },
  },
});
