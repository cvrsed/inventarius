# Ficha técnica

Verificada contra el código de `phase/f2-inventario` (no contra los docs). Cada punto cita `archivo:línea`. Los números de
línea son los de esta rama; los de `pnpm-lock.yaml` cambian con cada actualización. No contiene IPs, hostnames ni datos reales.

## 1. Motor de base de datos

- **PostgreSQL 18.7** (verificado ejecutando la imagen: `postgres (PostgreSQL) 18.7`).
- Imagen `postgres:18-trixie@sha256:2ea8630df176ad090ec92136dee850397c5af8781e4bcf2e4162593691c61bbc`, la misma en desarrollo
  (`compose.yml:22`), e2e (`compose.e2e.yml:27`) y tests de integración (`apps/api/test/postgres.ts:6`).
- Extensiones: `citext` (`apps/api/drizzle/0000_extensions.sql:2`) y `pg_trgm` (`apps/api/drizzle/0005_inventory.sql:1`).
- El esquema de la cola de pg-boss se instala en el paso de migración (`apps/api/src/core/db/migrator.ts:22-26`).

## 2. Driver, pools, timeouts y apagado

- **Driver:** `pg` 8.23.1 (`node-postgres`) con **Drizzle ORM** 0.45.4 (`apps/api/src/core/db/client.ts:1-2`). Cola: **pg-boss** 12.38.2.
- **Pool de la app** (`createDb`): `max: 10` (`client.ts:21`) y, por conexión, `connectionTimeoutMillis`, `statement_timeout` e
  `idle_in_transaction_session_timeout` (`client.ts:22-24`). Los valores salen de la configuración (`core/config.ts:59-61`,
  tipo en `core/db/timeouts.ts`) y `0` significa sin tope:

  | Variable                            | Por defecto | Qué corta                                                |
  | ----------------------------------- | ----------- | -------------------------------------------------------- |
  | `DB_CONNECTION_TIMEOUT_MS`          | 5000        | Espera de una conexión libre del pool                    |
  | `DB_STATEMENT_TIMEOUT_MS`           | 30000       | Consulta más lenta que el tope (`statement_timeout`)     |
  | `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | 30000       | Transacción abierta sin actividad                        |
  | `SHUTDOWN_TIMEOUT_MS`               | 10000       | Apagado ordenado de la API y del worker (`config.ts:63`) |

  Tests: `apps/api/src/core/db/timeouts.int.test.ts` (consulta lenta, transacción inactiva, espera de conexión, tope `0`) y
  `core/config.test.ts`. La inactividad del pool sigue siendo la de `pg-pool` (10 s, `pg-pool/index.js:98-99`). El oyente
  `error` del pool descarta en silencio los clientes inactivos que Postgres cierra (`client.ts:28`); la API (`server.ts:16`)
  y el worker (`worker.ts:23`) además lo registran en el log.

- **Quién tiene qué pool:**
  - **API:** un pool de 10 propio (`server.ts:7`). No arranca pg-boss: solo consulta si existe su esquema (`client.ts:42-47`).
  - **Worker:** **dos pools**: el de la app, de 10 (`worker.ts:22`), y el interno de pg-boss (`worker.ts:14-19`, que solo recibe el
    tope de conexión; `pg-boss/dist/db.js:40` crea su propio `pg.Pool`, de 10 por defecto). Hasta 20 conexiones por worker.
  - **Migración y CLI:** pools propios de 1 conexión y **sin topes** (una migración puede tardar) (`migrator.ts:15,40`), pg-boss con la
    URL del migrador (`migrator.ts:22`); el CLI abre uno de 10 con los topes de la app (`cli.ts:48`).
  - Nada se comparte entre procesos: API, worker y migración son procesos distintos.
- **Apagado ordenado con tope** (`core/shutdown.ts:13-31`): ejecuta el cierre y termina con código `0` si acabó a tiempo; si falla
  o excede `SHUTDOWN_TIMEOUT_MS`, lo registra y termina igual con código `1`. Test: `core/shutdown.test.ts`.
  - API: `SIGINT`/`SIGTERM` → `shutdown(() => app.close())` → `onClose` → `pool.end()` (`server.ts:18-27`).
  - Worker: `boss.stop({ graceful: true, timeout })` → `pool.end()` (`worker.ts:33-38`); `stop` cierra además el pool interno de pg-boss.
  - Migración: `pool.end()` en `finally` (`migrator.ts:16-20`) y `boss.stop` (`:26`). CLI: `handle.close()` (`cli.ts:60`).

## 3. Usuarios de base de datos y privilegios

Se crean una sola vez al inicializar el volumen (`deploy/postgres/init/01-roles.sh:11-13`):

| Usuario                                       | Creación                                                            | Privilegios reales                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Superusuario del contenedor (`POSTGRES_USER`) | Imagen oficial (`compose.yml:24`)                                   | Solo lo usa el script de inicialización; la app nunca se conecta con él.                                                                                                                                                                                                                                                                             |
| `inventarius_migrator`                        | `01-roles.sh:11` (`LOGIN`, sin `SUPERUSER`/`CREATEDB`/`CREATEROLE`) | **Dueño de la base** (`01-roles.sh:13`) y, por tanto, de todo lo que crean las migraciones: DDL completo. Lo usa solo el paso `migrate` (`MIGRATION_DATABASE_URL`, `compose.yml:13`).                                                                                                                                                                |
| `inventarius_app`                             | `01-roles.sh:12` (`LOGIN`)                                          | Lo que otorga `grantAppAccess` (`migrator.ts:39-62`) en los esquemas `public` y `pgboss`: `USAGE` del esquema; `SELECT, INSERT, UPDATE, DELETE` en todas las tablas; `USAGE, SELECT` en secuencias; los mismos permisos como `DEFAULT PRIVILEGES` para objetos futuros. **Sin DDL.** Es el que usan API y worker (`DATABASE_URL`, `compose.yml:12`). |

- **`audit_log` es append-only:** `REVOKE UPDATE, DELETE, TRUNCATE` al final de la concesión (`migrator.ts:54-57`). Test: `apps/api/src/modules/users/identity.int.test.ts:500-506` (los tres fallan con `permission denied`).
- Las migraciones no contienen `GRANT`/`REVOKE` (se buscó en `apps/api/drizzle/*.sql`); todo está en `migrator.ts`.
- El registro de migraciones de Drizzle vive en el esquema `drizzle` (`drizzle-orm/pg-core/dialect.js:46`), al que la app no recibe permisos.
- Los privilegios por defecto de PostgreSQL 18 para `PUBLIC` (conectar, tablas temporales) no se modifican.

## 4. Variables de entorno y secretos

- **Dónde se leen:** `process.env` solo se toca en `apps/api/src/core/config.ts:145` (`loadConfig(env = process.env)`), en `apps/api/src/cli.ts:65` (pasa el entorno a la lectura de credenciales del `create-admin`) y en `apps/web/vite.config.ts` (`API_PROXY_TARGET`, solo desarrollo).
- **Validación:** esquema Zod (`config.ts:22-102`); si algo es inválido lanza `Configuración inválida: <variable>: <motivo>; …` (`config.ts:146-151`). Es un `throw` a nivel de módulo en `server.ts:6`/`worker.ts:10`, así que el proceso termina con error antes de abrir puertos.
- **Si falta una:** solo **`DATABASE_URL` es obligatoria** (`config.ts:72`) y, **en producción, `CSRF_SECRET`** (`config.ts:154-157`; fuera de producción se genera una aleatoria por proceso, `config.ts:168`). El resto tiene valor por defecto. `MIGRATION_DATABASE_URL` es opcional en la API, pero `migrate.ts:5-9` termina con código 1 si falta. Todas las variables están en `.env.example`.
- **Carga de `.env`:** solo en desarrollo, con `tsx --env-file-if-exists=../../.env` (`apps/api/package.json:7,8,12,18`). Las imágenes no leen `.env`: en producción las variables las pone el orquestador (no hay `env_file` en ningún compose ni Dockerfile).
- **Secretos dentro de imágenes:** no hay ninguno.
  - Los `Dockerfile` no declaran `ENV`/`ARG` con secretos (`Dockerfile:1-70`).
  - La imagen `api` solo contiene lo que `pnpm deploy --prod` empaqueta (`Dockerfile:32,45`); el `files` del paquete es `dist` y `drizzle` (`apps/api/package.json:48-51`). La imagen `web` solo copia `apps/web/dist` y el `Caddyfile` (`Dockerfile:52-53`).
  - `.env` y `.env.*` están en `.dockerignore:7-9` y en `.gitignore:2-4`. **Matiz:** esos patrones solo cubren la raíz del contexto (no son `**/.env`), así que un `.env` dentro de `apps/api/` entraría a la etapa de build; no llega a la imagen final por el `files` anterior.
  - Las contraseñas de `compose.yml:12-13,24-25` y `compose.e2e.yml:22-23`, y el `CSRF_SECRET` de `compose.e2e.yml:12`, son valores de desarrollo y de pruebas, viven en el archivo Compose y no dentro de ninguna imagen.

## 5. Hash de contraseñas

- **argon2id** con `memoryCost: 19456` KiB (19 MiB), `timeCost: 2`, `parallelism: 1` (`apps/api/src/modules/auth/password.ts:13-19`). Biblioteca `argon2` 0.45.2. La sal y la longitud del hash son las por defecto de la biblioteca (no se fijan).
- Política: mínimo 12 caracteres (`packages/shared/src/identity.ts:4`), lista embebida de ~58 contraseñas comunes (`password.ts:35-94`; ampliarla es la decisión abierta Q12), no igual al correo, no un solo carácter repetido (`password.ts:112-123`).
- Contraseña temporal: 20 caracteres con `randomInt` (`password.ts:125-131`).
- Al verificar con cuenta inexistente se verifica contra un hash señuelo para igualar tiempos (`auth/service.ts:16,106-110`).

## 6. Autorización por ruta

- **Cómo se declara:** cada ruta de `/api/v1` lleva `config.access` con una de tres funciones (`apps/api/src/core/access.ts:38,43,57`): `publicRoute()`, `authenticatedRoute({ allowPendingPasswordChange })` o `requirePermission(...permisos)` (basta uno).
- **Cómo se obliga:** el hook `onRoute` lanza un error y la app **no arranca** si una ruta del prefijo no declara acceso (`access.ts:64-76`, registrado en `app.ts:172`). El hook `onRequest` resuelve la sesión (`app.ts:181`) y aplica el acceso (`access.ts:79-99`, `app.ts:183`): 401 sin sesión, 403 sin permiso, y un error específico si la contraseña es temporal (`access.ts:82-85`).
- **Rutas públicas de `/api/v1` (solo dos):** `GET /auth/csrf` (`auth/routes.ts:36-38`) y `POST /auth/login` (`auth/routes.ts:57-60`, con límite de 20/min por IP configurable). Las autenticadas sin permiso específico: `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` (`auth/routes.ts:77,91,103`) y `GET /settings` (`settings/routes.ts:11`).
- **Fuera de `/api/v1` (no cubiertas por el hook):** `GET /api/health/live` y `/api/health/ready` (públicas, `health/routes.ts:8,14`) y `GET /api/metrics` (bearer `METRICS_TOKEN` o solo IP interna, `core/metrics.ts:36-47`; Caddy responde 404 a esa ruta, `Caddyfile`). `GET /api/openapi.json` solo existe fuera de producción (`app.ts:213`).
- **Test que lo garantiza:** `apps/api/src/modules/rbac/permissions.int.test.ts:35-93`: recorre **todas** las rutas registradas de `/api/v1` y las llama sin sesión y con cada uno de los 4 roles semilla, comparando con el permiso declarado (anónimo → 401; rol sin permiso → 403; con permiso → ni 401 ni 403). Además la matriz de la BD debe coincidir con `packages/shared` (`:22-33`).

## 7. Sesiones y CSRF

- **Almacenamiento:** tabla `sessions` (`core/db/schema.ts:100-114`): `id` = **SHA-256 del token** (el token en claro nunca se guarda, `auth/service.ts:18,80`), `user_id` con `ON DELETE CASCADE`, `last_seen_at`, `expires_at` (absoluta), `ip` y `user_agent` (recortado a 300 caracteres, `service.ts:85`). Token: 32 bytes aleatorios en base64url (`service.ts:77`).
- **Cookie** (`auth/cookies.ts:11-24`): `HttpOnly`, `SameSite=Strict`, `Path=/`. **Sin `Max-Age`/`Expires`**: es cookie de sesión del navegador; la expiración real la impone el servidor.
  **`Secure` y el prefijo `__Host-` solo en producción** (`config.ts:182`, nombres en `cookies.ts:5-9`), o con `SESSION_COOKIE_SECURE=true`. Es una decisión, no una omisión: los navegadores rechazan las cookies `Secure` y `__Host-` sin HTTPS, y en desarrollo local y en la red interna de Compose del e2e (`compose.e2e.yml:15`, `SESSION_COOKIE_SECURE: 'false'`) se llega por HTTP. En producción el túnel hacia Internet termina TLS.
- **Expiración:** inactiva (por defecto 8 h, `SESSION_IDLE_TIMEOUT_SECONDS`) y absoluta (24 h, `SESSION_ABSOLUTE_TIMEOUT_SECONDS`), ambas comprobadas en cada petición (`service.ts:143-154`); la vencida se borra al detectarla. Tests: `auth.int.test.ts:198,209` y `session-defaults.int.test.ts:23`.
- **Renovación:** deslizante para la inactividad. `last_seen_at` se actualiza como máximo cada `min(30 s, inactividad/4)` (`service.ts:20,51-57,160-162`); la expiración absoluta no se renueva. Test: `session-touch.int.test.ts:13,23`.
- **Rotación al login con revocación de la anterior:** cada login crea un token nuevo y, **en la misma transacción, borra la sesión previa que traía la cookie** (`auth/routes.ts:68` pasa `req.auth?.sessionId`; `service.ts:126-138`, revocación en `:127`). Un login fallido no revoca nada. Tests: `auth.int.test.ts:29-60` (misma cuenta, otra cuenta sobre la cookie y login fallido). El cambio de contraseña borra **todas** las sesiones del usuario y abre una nueva (`service.ts:197-209`).
- **Invalidaciones:** al desactivar al usuario (`users/service.ts:205`), al cambiar su correo (`:207` y `:249`), al restablecer su contraseña (`:274`) y al cambiar la propia (`auth/service.ts:199`). Logout borra la sesión actual (`service.ts:166-176`). Una cuenta desactivada se rechaza también en `resolve` (`service.ts:155-159`). Los permisos se leen en cada petición (`service.ts:155`), por lo que un cambio de rol surte efecto de inmediato sin invalidar sesiones.
- **Purga:** cada hora (`jobs/maintenance.ts:8`, `0 * * * *`) con pg-boss en el worker (`worker.ts:27`).
- **CSRF firmado y ligado a la sesión:**
  - El token es **HMAC-SHA256** con `CSRF_SECRET` del «vínculo» de quien lo pide: el **id de sesión** si hay sesión; antes del login, una cookie anónima aleatoria `csrf`/`__Host-csrf` (`HttpOnly`, `SameSite=Strict`) (`auth/csrf.ts:9,26`). `GET /auth/csrf` lo entrega y crea la cookie anónima si falta (`auth/routes.ts:36-55`).
  - Se valida en **todo método no seguro** de `/api/v1`, incluido el login, en `onRequest`, tras resolver sesión y acceso y antes de validar el cuerpo (`app.ts:184-200`); comparación en tiempo constante (`csrf.ts:14-23`); responde 403 «Token CSRF inválido o ausente».
  - `CSRF_SECRET`: mínimo 32 caracteres, obligatorio en producción (`config.ts:68-71,154-157`).
  - Tests: `auth/csrf.test.ts` (token y vínculo) y `auth.int.test.ts:86-190` (un token válido de **otra** sesión se rechaza; el anterior al login deja de valer; inventado, sin firma o ausente; el login exige el token de su propia cookie anónima; cookie de sesión robada con un token propio).
- **Bloqueo por fuerza bruta:** por cuenta (5 fallos) y por IP (20) con espera progresiva y tope (`auth/throttle.ts`, `config.ts` `LOGIN_*`); rate limit global de 600/min por IP (`app.ts:136-142`).

## 8. Diferencias entre la documentación y el código

Solo lo que sigue pendiente. Lo demás coincide, verificado: argon2id y sus parámetros, 256 bits de token y solo su hash en BD,
expiración inactiva/absoluta, rotación con revocación de la sesión previa, invalidaciones, purga horaria, CSRF firmado y ligado a
la sesión, `Secure`/`__Host-` solo en producción (con su motivo en `docs/requirements.md` y `docs/security.md`), topes de BD y
apagado con tope, `audit_log` append-only y el test de permisos por rol en todas las rutas.

| #   | Documento                                                                  | Dice                      | El código hace                                                                                                                                                                                                                                                                      | Fase                                                                    |
| --- | -------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | `docs/requirements.md:487` (Helmet, CSP estricta, HSTS, `frame-ancestors`) | Controles del MVP         | La API registra Helmet **con sus valores por defecto** (`app.ts:134`) y eso solo alcanza a las respuestas de `/api`. La SPA la sirve Caddy con solo tres cabeceras (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `deploy/Caddyfile:19-21`): **sin CSP ni HSTS**. | **F4** (`docs/requirements.md:598`, «Endurecimiento (CSP, cabeceras…)») |
| 2   | `docs/requirements.md:488` (AES-256-GCM, `APP_ENCRYPTION_KEY`)             | Cifrado de claves LoRaWAN | No existe en el código (no hay ninguna referencia a `APP_ENCRYPTION_KEY`).                                                                                                                                                                                                          | **F3**                                                                  |

## 9. Stack: versiones exactas

Versiones tomadas de `pnpm-lock.yaml` (línea entre paréntesis) y de los `Dockerfile`/compose. Todas las dependencias npm están
fijadas a versión exacta: `savePrefix: ''` (`pnpm-workspace.yaml:18`), `save-exact=true` (`.npmrc:1`), ningún `package.json` usa
rangos y el CI instala con `--frozen-lockfile` (`.github/workflows/ci.yml:28`).

| Componente                                   | Versión                                                                                                           | Fuente                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Node (desarrollo y CI)                       | 24.22.3 LTS (la matriz del CI también prueba la 26, solo como alerta temprana)                                    | `.nvmrc:1`, `ci.yml:41`, ADR 0006                                     |
| Node (imagen)                                | 24.22.3, `node:24-trixie-slim@sha256:af02d57b…24a0` (Debian 13, verificado ejecutándola)                          | `Dockerfile:2`                                                        |
| pnpm                                         | 12.21.0                                                                                                           | `package.json:6`, `Dockerfile:6`, `ci.yml:16`                         |
| TypeScript                                   | 6.0.3                                                                                                             | lock `:4403`                                                          |
| Vue                                          | 3.5.45                                                                                                            | lock `:4758`                                                          |
| Vite                                         | 8.3.8                                                                                                             | lock `:4608`                                                          |
| Vue Router                                   | 5.5.1                                                                                                             | lock `:4734`                                                          |
| Pinia                                        | 4.1.0                                                                                                             | lock `:3900`                                                          |
| vue-i18n                                     | 11.4.20                                                                                                           | lock `:4728`                                                          |
| TanStack Query (Vue)                         | 5.107.1                                                                                                           | lock `:1775`                                                          |
| Nuxt UI                                      | 4.12.0                                                                                                            | lock `:1423`                                                          |
| Tailwind CSS                                 | 4.3.5                                                                                                             | lock `:4282`                                                          |
| Fastify                                      | 5.12.8                                                                                                            | lock `:3107`                                                          |
| `@fastify/helmet`                            | 13.2.0                                                                                                            | lock `:1224`                                                          |
| `@fastify/cookie`                            | 11.1.5                                                                                                            | lock `:1209`                                                          |
| `@fastify/rate-limit`                        | 11.2.2                                                                                                            | lock `:1233`                                                          |
| `@fastify/swagger`                           | 9.9.4                                                                                                             | lock `:1236`                                                          |
| `@fastify/under-pressure`                    | 9.2.1                                                                                                             | lock `:1239`                                                          |
| `fastify-type-provider-zod`                  | 7.0.0                                                                                                             | lock `:3099`                                                          |
| `fastify-metrics`                            | 15.0.1                                                                                                            | lock `:3086`                                                          |
| Zod                                          | 4.6.7                                                                                                             | lock `:4875`                                                          |
| Drizzle ORM                                  | 0.45.4                                                                                                            | lock `:2756`                                                          |
| drizzle-kit                                  | 0.31.11                                                                                                           | lock `:2752`                                                          |
| Driver de Postgres (`pg`)                    | 8.23.1                                                                                                            | lock `:3877`                                                          |
| pg-boss                                      | 12.38.2                                                                                                           | lock `:3848`                                                          |
| argon2                                       | 0.45.2                                                                                                            | lock `:2416`                                                          |
| pino                                         | 10.4.0                                                                                                            | lock `:3916`                                                          |
| Vitest                                       | 5.1.0                                                                                                             | lock `:4651`                                                          |
| Testcontainers                               | 12.2.1                                                                                                            | lock `:4311`                                                          |
| Playwright (`@playwright/test`)              | 1.65.1                                                                                                            | lock `:1508`                                                          |
| axe (`@axe-core/playwright` y `axe-core`)    | 4.14.0                                                                                                            | lock `:389` y `:2466`                                                 |
| Imagen de Postgres                           | 18.7 (Debian 13), `postgres:18-trixie@sha256:2ea8630d…bbc`                                                        | `compose.yml:22`, `compose.e2e.yml:27`, `apps/api/test/postgres.ts:6` |
| Imagen de Caddy (excepción Alpine, ADR 0006) | 2.11.9, `caddy:2-alpine@sha256:003a9780…2c0` (verificado ejecutándola)                                            | `Dockerfile:3`                                                        |
| Imagen base de Node                          | `node:24-trixie-slim@sha256:af02d57b…24a0`                                                                        | `Dockerfile:2`                                                        |
| Imagen de Playwright                         | `v1.65.1-noble@sha256:1507cbfc…5579`, igual a la del paquete (lo verifica `scripts/check-playwright-version.mjs`) | `Dockerfile:5`, `ci.yml:29`                                           |
| gitleaks (pre-commit y reglas)               | 8.24.3                                                                                                            | `scripts/gitleaks.sh`, `scripts/test-gitleaks.sh`                     |
| gitleaks (CI, escaneo del PR)                | acción `v3` fijada por SHA; el binario lo elige la acción                                                         | `ci.yml:102`                                                          |
| OSV-Scanner                                  | acción `v2.7.1` fijada por SHA                                                                                    | `ci.yml:97`                                                           |
| Trivy                                        | acción `v0.36.0` fijada por SHA; el binario es el que trae esa acción                                             | `ci.yml:127`                                                          |

### Acciones de GitHub

Todas van fijadas por **SHA de commit** con la versión en un comentario, y `scripts/check-actions-pinned.mjs` (paso del CI,
`ci.yml:30`) falla si alguna no lo está. Renovate las actualiza agrupadas (`renovate.json`, regla `github-actions`).

| Acción                                         | Versión | SHA            |
| ---------------------------------------------- | ------- | -------------- |
| `actions/checkout`                             | v7      | `3d3c42e5…0b1` |
| `actions/setup-node`                           | v7      | `949feb24…5c1` |
| `actions/upload-artifact`                      | v7      | `cf430e03…cd9` |
| `docker/setup-buildx-action`                   | v4      | `f87e5991…069` |
| `docker/build-push-action`                     | v7      | `c3c9e263…0dc` |
| `gitleaks/gitleaks-action`                     | v3      | `e0c47f4f…d1e` |
| `google/osv-scanner-action/osv-scanner-action` | v2.7.1  | `32d3cd48…932` |
| `aquasecurity/trivy-action`                    | v0.36.0 | `ed142fd0…c25` |

### Lo que no tiene versión exacta fijada

Ninguna dependencia npm ni acción de GitHub: todas son exactas. Quedan sin fijar o fijadas de forma parcial:

1. **Binarios que traen las acciones:** gitleaks del CI, OSV-Scanner y Trivy (y su base de datos de vulnerabilidades) son los que cada acción descarga; solo el gitleaks de pre-commit y del test de reglas está fijado (8.24.3, por etiqueta de imagen, sin digest).
2. **Matriz de Node del CI:** `'24.22.3'` es exacta (igual que `.nvmrc` y la imagen); `'26'` flota a propósito, como alerta temprana de compatibilidad (`ci.yml:41`, ADR 0006). `engines` pide rangos mínimos (`node >=24.22.0`, `pnpm >=12.21.0`, `package.json:7-10`), mientras `.nvmrc` y `packageManager` son exactos.
3. **Imagen `api`:** `apt-get upgrade -y` al construirla (`Dockerfile:38-39`) trae los paquetes de Debian vigentes ese día, así que la imagen no es reproducible bit a bit (es deliberado, por parches de seguridad). Además `npm` (solo en las etapas de build) viene de la imagen base.
4. Las imágenes de Postgres, Caddy, Node y Playwright llevan etiqueta **y** digest, por lo que están fijadas de forma exacta; Renovate propone las actualizaciones por PR (`renovate.json`).

## 10. Consumibles (F3.5)

- **Modelo de datos.** `measure_units`, `consumables`, `consumable_warehouse_minimums`, `consumable_movements` (libro) y
  `consumable_stock` (saldo por consumible y bodega); `categories.scope` separa las categorías de activos de las de
  consumibles. Migración `0017_consumables.sql` (incluye la semilla de unidades y los permisos).
- **Cantidades.** `numeric(14,3)`. En la API y el web son texto; los cálculos usan milésimas en `bigint`
  (`packages/shared/src/consumables.ts`). El servidor nunca convierte una cantidad a `number`.
- **Libro append-only.** `inventarius_app` no tiene `UPDATE`, `DELETE` ni `TRUNCATE` sobre `consumable_movements` (lo aplica
  `grantAppAccess` del migrador, como en `audit_log`). `reverses_id` es `UNIQUE`: un movimiento se anula una vez.
- **Concurrencia.** Consumible `FOR SHARE`, luego saldos `FOR UPDATE` ordenados por id; el `CHECK (quantity >= 0)` de
  `consumable_stock` es el respaldo. Todo dentro de una sola transacción y una sola conexión.
- **Cuadratura.** `pnpm --filter @inventarius/api cli verify-consumables` (ver `docs/operations.md`).
- **Rutas** (`/api/v1`): `GET|POST /measure-units`, `PATCH|DELETE /measure-units/:id`, `GET|POST /consumables`,
  `GET|PATCH|DELETE /consumables/:id`, `GET /consumables/:id/movements`, `POST /consumables/:id/{receipts,deliveries,transfers,adjustments}`,
  `POST /consumable-movements/:id/reversals`, `GET /consumable-recipients`. Cada una declara su permiso `consumables:*`.
- **Decisiones y preguntas abiertas:** ADR 0008 y `docs/open-questions.md` (Q56 a Q69).
