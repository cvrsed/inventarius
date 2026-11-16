import { defineConfig, devices } from '@playwright/test';

/** URL de la app bajo prueba. En CI es el servicio `web` de la red de Compose. */
const baseURL = process.env['BASE_URL'] ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { baseURL, trace: 'retain-on-failure', locale: 'es-CL', timezoneId: 'America/Santiago' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    // 360 px es el ancho mínimo soportado (RF-40).
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 740 } } },
  ],
});
