import { defineConfig } from 'vitest/config';

const common = {
  resolve: { conditions: ['inventarius-source'] },
  ssr: { resolve: { conditions: ['inventarius-source'] } },
};

export default defineConfig({
  // La condición `inventarius-source` también debe aplicar al nivel raíz: el `globalSetup` del proyecto `int` (que importa
  // `migrator.ts` y, con él, `@inventarius/shared`) no hereda lo que se declara dentro de cada proyecto y, sin esto, resuelve
  // el export `default` (`./dist/index.js`), que solo existe si alguien compiló `shared` antes. Así los tests no dependen de un build.
  ...common,
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
