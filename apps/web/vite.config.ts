import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Mismo origen en dev: el front llama a /api y Vite lo reenvía a la API.
    proxy: { '/api': { target: process.env['API_PROXY_TARGET'] ?? 'http://localhost:3000' } },
  },
  build: { target: 'es2023' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/env.d.ts'],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 60 },
    },
  },
});
