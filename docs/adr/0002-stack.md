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
| Node.js             | **24.22.3** (`.nvmrc`; `engines` ≥ 24.22)                     | Decisión D1 revisada en el ADR 0006: Node 24 LTS por política de la organización; el CI también prueba Node 26. |
| pnpm                | **12.21.0** (`packageManager`)                                | pnpm 12 bloquea scripts de instalación: se aprueban solo `esbuild` y `lefthook` (`allowBuilds`).                |
| TypeScript          | **6.0.3**                                                     | Se queda en 6.0.x (ver «TypeScript 7» abajo y Q3).                                                              |
| PostgreSQL          | **18.7** (`postgres:18-trixie@sha256:2ea8630d…`)              | `uuidv7()` nativo; el volumen se monta en `/var/lib/postgresql`.                                                |
| Caddy               | 2.11.9 (`caddy:2-alpine@sha256:003a9780…`)                    | SPA + proxy `/api`.                                                                                             |
| Imagen Node         | `node:24-trixie-slim@sha256:af02d57b…`                        | Base de dev y runtime de API/worker (ADR 0006).                                                                 |
| Playwright (imagen) | `mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc…` | Misma versión que el paquete; lo verifica `scripts/check-playwright-version.mjs` en CI.                         |

### Backend (`apps/api`)

fastify 5.12.8 · fastify-type-provider-zod 7.0.0 · zod 4.6.7 · @fastify/helmet 13.2.0 · @fastify/under-pressure 9.2.1 ·
@fastify/swagger 9.9.4 · fastify-metrics 15.0.1 · pino 10.4.0 · drizzle-orm 0.45.4 · drizzle-kit 0.31.11 · pg 8.23.1 ·
pg-boss 12.38.2 · tsx 4.23.15 · vitest 5.1.0 · testcontainers / @testcontainers/postgresql 12.2.1.

`@fastify/cookie`, `@fastify/csrf-protection`, `@fastify/rate-limit` y `argon2` entran en F1 (identidad).

### Frontend (`apps/web`)

vue 3.5.45 · vite 8.3.8 · @vitejs/plugin-vue 6.0.11 · vue-router 5.5.1 · pinia 4.1.0 · vue-i18n 11.4.20 ·
@tanstack/vue-query 5.107.1 · **@nuxt/ui 4.12.0** (MIT; incluye reka-ui 2.11.0 y tailwind-variants) · tailwindcss 4.3.5 ·
@iconify-json/lucide 1.2.155 (ISC) · @iconify/vue 5.0.5 · vue-tsc 3.3.14 · @vue/test-utils 2.6.0 · jsdom 31.0.1.

La UI pasó de PrimeVue 4.5.5 a Nuxt UI v4 el 2026-11-16 porque PrimeVue 5 exige licencia con clave: ver
[ADR 0004](0004-ui-nuxt-ui-v4.md). Se fijó la 4.12.0 y no la 4.12.2 (la última) porque esta se publicó el mismo día
y queda bajo la política de antigüedad mínima de pnpm. `primeicons` ya no se usa: los íconos son Lucide, empaquetados
en el build. Nuxt UI es una dependencia de la lista 7.2 del requerimiento.

### TypeScript 7

TypeScript se mantiene en **6.0.x**. TypeScript 7 (el compilador nativo) no expone una API programática estable
hasta la 7.1, y tanto `typescript-eslint` (que declara `<6.1`) como `vue-tsc` la necesitan para analizar el código.
Hasta que ambos soporten 7.x no se migra; se revisa cuando salga 7.1 (Q3). Subir de versión mayor será un PR propio.

### Calidad y pruebas

eslint 10.15.0 · typescript-eslint 8.72.2 · eslint-plugin-vue 10.12.1 · prettier 3.10.1 · @commitlint/cli 21.2.4 ·
lefthook 2.2.2 · @playwright/test 1.65.1 · @axe-core/playwright 4.14.0 · @vitest/coverage-v8 5.1.0.

## Decisiones de construcción

- **`packages/shared` exporta con condiciones**: `inventarius-source` (TS fuente, usado por tsx, Vite/Vitest y `tsc`) y `default`
  (`dist/`, JS compilado, usado por Node en producción). Así no hay que compilar `shared` en el ciclo de desarrollo.
- **Migraciones**: Drizzle (SQL versionado en `apps/api/drizzle`) más instalación del esquema `pgboss` con el
  usuario migrador. La API y el worker corren con `inventarius_app` (solo DML) y con `migrate: false`.
- **Imágenes**: un solo `Dockerfile` multi-etapa (`dev`, `build`, `api`, `web`, `e2e`).
- **Renovate** (`renovate.json`) es el único camino para subir versiones: PR con CI en verde.

## Consecuencias

- Subir una versión mayor (Nuxt UI 5, TypeScript 7) es una tarea explícita, con su propio PR.
- pnpm 12 es muy reciente; si un contribuyente usa otra versión, `engine-strict` lo avisa.
