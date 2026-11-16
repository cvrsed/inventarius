# Desarrollo local

## Requisitos

- Node.js 26.13.1 (ver `.nvmrc`; funciona también en 24 LTS) y pnpm 12.21.0 (`corepack enable` o `npm i -g pnpm@12.21.0`).
- Docker con Compose (Postgres, e2e y las imágenes).

## Levantar todo

```bash
pnpm install
docker compose up --build        # Postgres 18 + migraciones + API + worker + web (Vite)
```

- Web: http://localhost:5173 (Vite reenvía `/api` a la API).
- API: http://localhost:3000 (`/api/health/ready`, `/api/openapi.json` fuera de producción).
- Las contraseñas por defecto de `compose.yml` son solo de desarrollo; para cambiarlas, copia `.env.example` a `.env`.
- Si cambias dependencias, vuelve a construir (`docker compose up --build`): `node_modules` vive en la imagen.

## Sin Docker para la app

Con un Postgres accesible y las variables de `.env.example` en un `.env`:

```bash
pnpm --filter @inventarius/api migrate
pnpm --filter @inventarius/api dev          # API
pnpm --filter @inventarius/api dev:worker   # worker
pnpm --filter @inventarius/web dev
```

## Calidad (antes de cada commit)

```bash
pnpm lint && pnpm typecheck && pnpm test
```

- `pnpm test`: unitarios (shared, api, web). No requiere Docker.
- `pnpm --filter @inventarius/api test:int`: integración contra Postgres 18 real (Testcontainers, requiere Docker).
- `pnpm test:coverage`: todo, con umbrales de cobertura.

## E2E (Playwright + axe, en Docker con la imagen oficial)

```bash
docker compose -f compose.e2e.yml up -d --build --wait web worker
docker compose -f compose.e2e.yml run --rm --build e2e
docker compose -f compose.e2e.yml down --volumes
```

El reporte HTML queda en `e2e/playwright-report/`. No uses `up --exit-code-from`: aborta cuando termina `migrate`.
La versión de la imagen de Playwright debe ser igual a la del paquete (`node scripts/check-playwright-version.mjs`).
