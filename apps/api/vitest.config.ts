import { defineConfig } from 'vitest/config';

const common = {
  resolve: { conditions: ['inventarius-source'] },
  ssr: { resolve: { conditions: ['inventarius-source'] } },
};

export default defineConfig({
  test: {
    // El paquete workspace exporta TS fuente bajo la condición `source`; Vite debe transformarlo, no Node.
    server: { deps: { inline: ['@inventarius/shared'] } },
    testTimeout: 30_000,
    hookTimeout: 120_000,
    projects: [
      {
        ...common,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
          server: { deps: { inline: ['@inventarius/shared'] } },
        },
      },
      {
        ...common,
        test: {
          name: 'int',
          include: ['src/**/*.int.test.ts'],
          globalSetup: ['./test/global-setup.ts'],
          server: { deps: { inline: ['@inventarius/shared'] } },
          // Un solo contenedor compartido; cada archivo usa su propia base clonada de la plantilla.
          fileParallelism: true,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/server.ts',
        'src/worker.ts',
        'src/migrate.ts',
        'src/cli.ts',
      ],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
