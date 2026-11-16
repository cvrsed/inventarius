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

## Primer administrador (RF-02)

No hay registro público. Tras migrar, crea el primer administrador con el CLI:

```bash
# Pregunta la contraseña sin eco (recomendado)
pnpm --filter @inventarius/api cli create-admin --email tu@correo.cl --name "Tu Nombre"
# O la toma de una variable de entorno (nunca como argumento: quedaría en el historial del shell)
ADMIN_PASSWORD='…' pnpm --filter @inventarius/api cli create-admin --email tu@correo.cl --name "Tu Nombre" --password-env ADMIN_PASSWORD
```

Con `--if-missing` repetirlo no es error (útil en despliegues automatizados).
Con Docker de desarrollo: `docker compose run --rm -it api pnpm --filter @inventarius/api cli create-admin --email … --name …`.

## Variables de sesión y bloqueo (todas opcionales)

`SESSION_IDLE_TIMEOUT_SECONDS` (8 h), `SESSION_ABSOLUTE_TIMEOUT_SECONDS` (24 h), `SESSION_COOKIE_SECURE`
(por defecto `true` solo en producción; con `true` la cookie usa el prefijo `__Host-` y exige HTTPS),
`LOGIN_MAX_FAILURES_PER_ACCOUNT` (5), `LOGIN_MAX_FAILURES_PER_IP` (20), `LOGIN_LOCK_BASE_SECONDS` (60),
`LOGIN_LOCK_MAX_SECONDS` (1800), `LOGIN_RATE_LIMIT_PER_MINUTE` (20), `RATE_LIMIT_MAX_PER_MINUTE` (600).
