# ADR 0002 — Stack y versiones fijadas

- Estado: aceptada
- Fecha: 2026-11-16

## Contexto

La sección 7.2 del requerimiento da la línea base del stack y pide fijar versiones exactas en la Fase 0
(RNF-09). Las versiones de abajo son las vigentes al instalar (2026-11-16), resueltas con `pnpm add` y
guardadas con versión exacta (`savePrefix: ''` en `pnpm-workspace.yaml`) más `pnpm-lock.yaml` commiteado.

## Decisión

### Runtime y herramientas

| Pieza               | Versión                                                       | Nota                                                                                                            |
| ------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Node.js             | **26.13.1** (`.nvmrc`; `engines` ≥ 24)                        | Decisión D1: Node 26 funciona con todo el stack. CI también corre los tests unitarios en Node 24 como respaldo. |
| pnpm                | **12.21.0** (`packageManager`)                                | pnpm 12 bloquea scripts de instalación: se aprueban solo `esbuild` y `lefthook` (`allowBuilds`).                |
| TypeScript          | **6.0.3**                                                     | Se queda en 6.0.x (ver «TypeScript 7» abajo y Q3).                                                              |
| PostgreSQL          | **18.7** (`postgres:18@sha256:2ea8630d…`)                     | `uuidv7()` nativo; el volumen se monta en `/var/lib/postgresql`.                                                |
| Caddy               | 2.11.9 (`caddy:2-alpine@sha256:003a9780…`)                    | SPA + proxy `/api`.                                                                                             |
| Imagen Node         | `node:26-slim@sha256:e6bedef2…`                               | Base de dev y runtime de API/worker.                                                                            |
| Playwright (imagen) | `mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc…` | Misma versión que el paquete; lo verifica `scripts/check-playwright-version.mjs` en CI.                         |

### Backend (`apps/api`)

fastify 5.12.8 · fastify-type-provider-zod 7.0.0 · zod 4.6.7 · @fastify/helmet 13.2.0 · @fastify/under-pressure 9.2.1 ·
@fastify/swagger 9.9.4 · fastify-metrics 15.0.1 · pino 10.4.0 · drizzle-orm 0.45.4 · drizzle-kit 0.31.11 · pg 8.23.1 ·
pg-boss 12.38.2 · tsx 4.23.15 · vitest 5.1.0 · testcontainers / @testcontainers/postgresql 12.2.1.

`@fastify/cookie`, `@fastify/csrf-protection`, `@fastify/rate-limit` y `argon2` entran en F1 (identidad).

### Frontend (`apps/web`)

vue 3.5.45 · vite 8.3.8 · @vitejs/plugin-vue 6.0.11 · vue-router 5.5.1 · pinia 4.1.0 · vue-i18n 11.4.20 ·
@tanstack/vue-query 5.107.1 · **primevue 4.5.5** · @primeuix/themes 2.0.3 · tailwindcss 4.3.5 (+ @tailwindcss/vite) ·
tailwindcss-primeui 0.6.1 · primeicons 8.0.2 · vue-tsc 3.3.14 · @vue/test-utils 2.6.0 · jsdom 31.0.1.

PrimeVue se queda en 4.x como pide el requerimiento y el ADR 0003, aunque exista la 5.x (Q2).
`primeicons` es el set de íconos oficial de PrimeVue y quedó **aceptado** como parte del stack (decisión de Rodrigo);
figura en la lista de la sección 7.2 de `docs/requirements.md`.

PrimeVue 5.0.x es estable en npm, pero su licencia dejó de ser MIT: exige clave y pago según el tamaño de la
organización. Mientras Rodrigo y la empresa cliente no lo decidan, se mantiene 4.5.5 (MIT). Detalle en Q2.

### TypeScript 7

TypeScript se mantiene en **6.0.x**. TypeScript 7 (el compilador nativo) no expone una API programática estable
hasta la 7.1, y tanto `typescript-eslint` (que declara `<6.1`) como `vue-tsc` la necesitan para analizar el código.
Hasta que ambos soporten 7.x no se migra; se revisa cuando salga 7.1 (Q3). Subir de versión mayor será un PR propio.

### Calidad y pruebas

eslint 10.15.0 · typescript-eslint 8.72.2 · eslint-plugin-vue 10.12.1 · prettier 3.10.1 · @commitlint/cli 21.2.4 ·
lefthook 2.2.2 · @playwright/test 1.65.1 · @axe-core/playwright 4.14.0 · @vitest/coverage-v8 5.1.0.

## Decisiones de construcción

- **`packages/shared` exporta con condiciones**: `source` (TS fuente, usado por tsx, Vite/Vitest y `tsc`) y `default`
  (`dist/`, JS compilado, usado por Node en producción). Así no hay que compilar `shared` en el ciclo de desarrollo.
- **Migraciones**: Drizzle (SQL versionado en `apps/api/drizzle`) más instalación del esquema `pgboss` con el
  usuario migrador. La API y el worker corren con `inventarius_app` (solo DML) y con `migrate: false`.
- **Imágenes**: un solo `Dockerfile` multi-etapa (`dev`, `build`, `api`, `web`, `e2e`).
- **Renovate** (`renovate.json`) es el único camino para subir versiones: PR con CI en verde.

## Consecuencias

- Subir una versión mayor (PrimeVue 5, TypeScript 7) es una tarea explícita, con su propio PR.
- pnpm 12 y Node 26 son muy recientes; si un contribuyente usa otra versión, `engine-strict` lo avisa.
