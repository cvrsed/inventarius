# Ficha técnica

Verificada contra el código de `phase/f2-inventario` (no contra los docs). Cada punto cita `archivo:línea`. Los números de
línea son los de esta rama; los de `pnpm-lock.yaml` cambian con cada actualización. No contiene IPs, hostnames ni datos reales.

## 1. Motor de base de datos

- **PostgreSQL 18.7** (verificado ejecutando la imagen: `postgres (PostgreSQL) 18.7`).
- Imagen `postgres:18@sha256:2ea8630df176ad090ec92136dee850397c5af8781e4bcf2e4162593691c61bbc`, la misma en desarrollo
  (`compose.yml:22`), e2e (`compose.e2e.yml:25`) y tests de integración (`apps/api/test/postgres.ts:6`).
- Extensiones: `citext` (`apps/api/drizzle/0000_extensions.sql:2`) y `pg_trgm` (`apps/api/drizzle/0005_inventory.sql:1`).
- El esquema de la cola de pg-boss se instala en el paso de migración (`apps/api/src/core/db/migrator.ts:22-26`).

## 2. Driver y pools de conexiones

- **Driver:** `pg` 8.23.1 (`node-postgres`) con **Drizzle ORM** 0.45.4 (`apps/api/src/core/db/client.ts:1-2`). Cola: **pg-boss** 12.38.2.
- **Pool de la app** (`createDb`): `new Pool({ connectionString, max: 10 })` (`client.ts:15`). No se configura ningún otro
  parámetro, así que valen los de `pg-pool`: inactividad 10 s (`pg-pool/index.js:98-99`) y **sin timeout de conexión** ni
  `statement_timeout` ni `query_timeout` (no hay ninguno en `apps/api/src`). El oyente `error` del pool descarta en silencio
  los clientes inactivos que Postgres cierra (`client.ts:18`); la API además lo registra en el log (`server.ts:15`) y el worker también (`worker.ts:21`).
- **Quién tiene qué pool:**
  - **API:** un pool de 10 propio (`server.ts:6`). No arranca pg-boss: solo consulta si existe su esquema (`client.ts:33-35`).
  - **Worker:** **dos pools**: el de la app, también de 10 (`worker.ts:20`), y el interno de pg-boss (`worker.ts:13-17`, sin `max`:
    pg-boss crea su propio `pg.Pool`, `pg-boss/dist/db.js:40`, con el máximo por defecto de 10). Hasta 20 conexiones por worker.
  - **Migración y CLI:** pools propios de 1 conexión (`migrator.ts:15` y `:40`) y pg-boss con la URL del migrador (`migrator.ts:22`); el CLI abre uno de 10 (`cli.ts:48`).
  - Nada se comparte entre procesos: API, worker y migración son procesos distintos.
- **Cierre al apagar:**
  - API: `SIGINT`/`SIGTERM` → `app.close()` → hook `onClose` → `pool.end()` → `process.exit(0)` (`server.ts:17-24`). No hay tope de tiempo ni `catch`.
  - Worker: `boss.stop({ graceful: true })` (pg-boss espera hasta 30 s por defecto, `pg-boss/dist/index.js:272`) → `pool.end()` → `exit(0)` (`worker.ts:28-35`). El pool interno de pg-boss lo cierra `stop` (`close` es `true` por defecto).
  - Migración: `pool.end()` en `finally` (`migrator.ts:16-20`) y `boss.stop` (`:26`). CLI: `handle.close()` (`cli.ts:60`).

## 3. Usuarios de base de datos y privilegios

Se crean una sola vez al inicializar el volumen (`deploy/postgres/init/01-roles.sh:11-13`):

| Usuario                                       | Creación                                                            | Privilegios reales                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Superusuario del contenedor (`POSTGRES_USER`) | Imagen oficial (`compose.yml:24`)                                   | Solo lo usa el script de inicialización; la app nunca se conecta con él.                                                                                                                                                                                                                                                                             |
| `inventarius_migrator`                        | `01-roles.sh:11` (`LOGIN`, sin `SUPERUSER`/`CREATEDB`/`CREATEROLE`) | **Dueño de la base** (`01-roles.sh:13`) y, por tanto, de todo lo que crean las migraciones: DDL completo. Lo usa solo el paso `migrate` (`MIGRATION_DATABASE_URL`, `compose.yml:13`).                                                                                                                                                                |
| `inventarius_app`                             | `01-roles.sh:12` (`LOGIN`)                                          | Lo que otorga `grantAppAccess` (`migrator.ts:39-60`) en los esquemas `public` y `pgboss`: `USAGE` del esquema; `SELECT, INSERT, UPDATE, DELETE` en todas las tablas; `USAGE, SELECT` en secuencias; los mismos permisos como `DEFAULT PRIVILEGES` para objetos futuros. **Sin DDL.** Es el que usan API y worker (`DATABASE_URL`, `compose.yml:12`). |

- **`audit_log` es append-only:** `REVOKE UPDATE, DELETE, TRUNCATE` al final de la concesión (`migrator.ts:54-57`). Test: `apps/api/src/modules/users/identity.int.test.ts:500-506` (los tres fallan con `permission denied`).
- Las migraciones no contienen `GRANT`/`REVOKE` (se buscó en `apps/api/drizzle/*.sql`); todo está en `migrator.ts`.
- El registro de migraciones de Drizzle vive en el esquema `drizzle` (`drizzle-orm/pg-core/dialect.js:46`), al que la app no recibe permisos.
- Los privilegios por defecto de PostgreSQL 18 para `PUBLIC` (conectar, tablas temporales) no se modifican.

## 4. Variables de entorno y secretos

- **Dónde se leen:** `process.env` solo se toca en `apps/api/src/core/config.ts:124` (`loadConfig(env = process.env)`), en `apps/api/src/cli.ts:65` (pasa el entorno a la lectura de credenciales del `create-admin`) y en `apps/web/vite.config.ts` (`API_PROXY_TARGET`, solo desarrollo).
- **Validación:** esquema Zod (`config.ts:7-90`); si algo es inválido lanza `Configuración inválida: <variable>: <motivo>; …` (`config.ts:125-131`). Es un `throw` a nivel de módulo en `server.ts:5`/`worker.ts:9`, así que el proceso termina con error antes de abrir puertos.
- **Si falta una:** solo **`DATABASE_URL` es obligatoria** (`config.ts:56`). El resto tiene valor por defecto. `MIGRATION_DATABASE_URL` es opcional en la API, pero `migrate.ts:5-9` termina con código 1 si falta. `SESSION_COOKIE_SECURE` por defecto es `true` solo con `NODE_ENV=production` (`config.ts:149`).
- **Carga de `.env`:** solo en desarrollo, con `tsx --env-file-if-exists=../../.env` (`apps/api/package.json:7,8,12,18`). Las imágenes no leen `.env`: en producción las variables las pone el orquestador (no hay `env_file` en ningún compose ni Dockerfile).
- **Secretos dentro de imágenes:** no hay ninguno.
  - Los `Dockerfile` no declaran `ENV`/`ARG` con secretos (`Dockerfile:1-70`).
  - La imagen `api` solo contiene lo que `pnpm deploy --prod` empaqueta (`Dockerfile:32,45`); el `files` del paquete es `dist` y `drizzle` (`apps/api/package.json:49-52`). La imagen `web` solo copia `apps/web/dist` y el `Caddyfile` (`Dockerfile:52-53`).
  - `.env` y `.env.*` están en `.dockerignore:7-9` y en `.gitignore:2-4`. **Matiz:** esos patrones solo cubren la raíz del contexto (no son `**/.env`), así que un `.env` dentro de `apps/api/` entraría a la etapa de build; no llega a la imagen final por el `files` anterior.
  - Las contraseñas de `compose.yml:12-13,24-25` y `compose.e2e.yml:20-21` son valores por defecto de desarrollo y de pruebas, viven en el archivo Compose y no dentro de ninguna imagen.

## 5. Hash de contraseñas

- **argon2id** con `memoryCost: 19456` KiB (19 MiB), `timeCost: 2`, `parallelism: 1` (`apps/api/src/modules/auth/password.ts:13-19`). Biblioteca `argon2` 0.45.2. La sal y la longitud del hash son las por defecto de la biblioteca (no se fijan).
- Política: mínimo 12 caracteres (`packages/shared/src/identity.ts:4`), lista embebida de ~58 contraseñas comunes (`password.ts:35-94`), no igual al correo, no un solo carácter repetido (`password.ts:112-123`).
- Contraseña temporal: 20 caracteres con `randomInt` (`password.ts:125-131`).
- Al verificar con cuenta inexistente se verifica contra un hash señuelo para igualar tiempos (`auth/service.ts:16,103-107`).

## 6. Autorización por ruta

- **Cómo se declara:** cada ruta de `/api/v1` lleva `config.access` con una de tres funciones (`apps/api/src/core/access.ts:38,43,57`): `publicRoute()`, `authenticatedRoute({ allowPendingPasswordChange })` o `requirePermission(...permisos)` (basta uno).
- **Cómo se obliga:** el hook `onRoute` lanza un error y la app **no arranca** si una ruta del prefijo no declara acceso (`access.ts:64-76`, registrado en `app.ts:185`). El hook `onRequest` resuelve la sesión (`app.ts:194`) y aplica el acceso (`access.ts:79-99`, `app.ts:196`): 401 sin sesión, 403 sin permiso, y un error específico si la contraseña es temporal (`access.ts:82-85`).
- **Rutas públicas de `/api/v1` (solo dos):** `GET /auth/csrf` (`auth/routes.ts:37`) y `POST /auth/login` (`auth/routes.ts:47`, con límite de 20/min por IP configurable). Las autenticadas sin permiso específico: `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` (`auth/routes.ts:64,78,90`) y `GET /settings` (`settings/routes.ts:11`).
- **Fuera de `/api/v1` (no cubiertas por el hook):** `GET /api/health/live` y `/api/health/ready` (públicas, `health/routes.ts:7-14`) y `GET /api/metrics` (bearer `METRICS_TOKEN` o solo IP interna, `core/metrics.ts:36-47`; Caddy responde 404 a esa ruta, `Caddyfile`). `GET /api/openapi.json` solo existe fuera de producción (`app.ts:214`).
- **Test que lo garantiza:** `apps/api/src/modules/rbac/permissions.int.test.ts:35-93`: recorre **todas** las rutas registradas de `/api/v1` y las llama sin sesión y con cada uno de los 4 roles semilla, comparando con el permiso declarado (anónimo → 401; rol sin permiso → 403; con permiso → ni 401 ni 403). Además la matriz de la BD debe coincidir con `packages/shared` (`:22-33`).

## 7. Sesiones

- **Almacenamiento:** tabla `sessions` (`core/db/schema.ts:100-114`): `id` = **SHA-256 del token** (el token en claro nunca se guarda, `auth/service.ts:18,80`), `user_id` con `ON DELETE CASCADE`, `last_seen_at`, `expires_at` (absoluta), `ip` y `user_agent` (recortado a 300 caracteres, `service.ts:85`). Token: 32 bytes aleatorios en base64url (`service.ts:77`).
- **Cookie** (`auth/cookies.ts:11-24`): `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` según `cookieSecure` (por defecto solo en producción, `config.ts:149`) y entonces con nombre `__Host-session` (`cookies.ts:5-9`). **Sin `Max-Age`/`Expires`**: es cookie de sesión del navegador; la expiración real la impone el servidor. En e2e va sin `Secure` (`compose.e2e.yml:13`).
- **Expiración:** inactiva (por defecto 8 h, `SESSION_IDLE_TIMEOUT_SECONDS`) y absoluta (24 h, `SESSION_ABSOLUTE_TIMEOUT_SECONDS`), ambas comprobadas en cada petición (`service.ts:139-150`); la vencida se borra al detectarla. Tests: `auth.int.test.ts:94,105` y `session-defaults.int.test.ts:23`.
- **Renovación:** deslizante para la inactividad. `last_seen_at` se actualiza como máximo cada `min(30 s, inactividad/4)` (`service.ts:49-57,156-158`, `TOUCH_INTERVAL_MS` en `:20`); la expiración absoluta no se renueva. Test: `session-touch.int.test.ts:13,23`.
- **Rotación al login:** cada login crea un token nuevo en una transacción con su registro de auditoría (`service.ts:123-133`). El cambio de contraseña borra **todas** las sesiones del usuario y abre una nueva (`service.ts:193-205`). Ver la diferencia del punto 8 sobre la sesión anterior.
- **Invalidaciones:** al desactivar al usuario (`users/service.ts:205`), al cambiar su correo (`:207` y `:249`), al restablecer su contraseña (`:274`) y al cambiar la propia (`auth/service.ts:195`). Logout borra la sesión actual (`service.ts:162-172`). Una cuenta desactivada se rechaza también en `resolve` (`service.ts:151-155`). Los permisos se leen en cada petición (`service.ts:151`), por lo que un cambio de rol surte efecto de inmediato sin invalidar sesiones.
- **Purga:** cada hora (`jobs/maintenance.ts:8`, `0 * * * *`) con pg-boss en el worker (`worker.ts:25`).
- **CSRF:** doble envío con `@fastify/csrf-protection` (`app.ts:142-158`): secreto en cookie `csrf`/`__Host-csrf` (`HttpOnly`, `SameSite=Strict`) y token en la cabecera `x-csrf-token` (`app.ts:152-153`), que entrega `GET /auth/csrf`. Se exige en todo método distinto de `GET`/`HEAD`/`OPTIONS` de `/api/v1`, **incluido el login** (`app.ts:198-200`). El token no está ligado a la sesión ni se rota al login. Test: `auth.int.test.ts:43`.
- **Bloqueo por fuerza bruta:** por cuenta (5 fallos) y por IP (20) con espera progresiva y tope (`auth/throttle.ts`, `config.ts` `LOGIN_*`); rate limit global de 600/min por IP (`app.ts:135-141`).

## 8. Diferencias entre la documentación y el código

| #   | Documento                                                                  | Dice                                | El código hace                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docs/requirements.md:482` y `docs/security.md:15`                         | «Rotación del ID al hacer login»    | Se crea un token nuevo, pero **la sesión anterior del mismo navegador no se revoca** (el login no lee la cookie existente: `auth/routes.ts:46-58`, `auth/service.ts:94-136`). Queda válida hasta que venza. No hay test que lo cubra.                                                                                                    |
| 2   | `docs/requirements.md:487` (Helmet, CSP estricta, HSTS, `frame-ancestors`) | Controles del MVP                   | La API registra Helmet **con sus valores por defecto** (`app.ts:133`) y eso solo alcanza a las respuestas de `/api`. La SPA la sirve Caddy con solo tres cabeceras (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `deploy/Caddyfile:19-21`): **sin CSP ni HSTS**. Está planificado en F4 (`docs/requirements.md:598`). |
| 3   | `docs/requirements.md:488` (AES-256-GCM, `APP_ENCRYPTION_KEY`)             | Cifrado de claves LoRaWAN           | No existe en el código (no hay ninguna referencia a `APP_ENCRYPTION_KEY`); corresponde a F3.                                                                                                                                                                                                                                             |
| 4   | `docs/requirements.md:482`                                                 | Cookie `Secure` y prefijo `__Host-` | Solo cuando `SESSION_COOKIE_SECURE=true` o `NODE_ENV=production` (`config.ts:149`); `docs/security.md:14` sí lo dice («producción»).                                                                                                                                                                                                     |
| 5   | `docs/security.md:7`                                                       | «Lista de contraseñas comunes»      | Lista de ~58 entradas (`password.ts:35-94`); ya registrada como pendiente (Q12).                                                                                                                                                                                                                                                         |
| 6   | `docs/security.md:20-24`                                                   | Rate limit «global por IP»          | Correcto, pero la «IP» depende de `TRUSTED_PROXIES`: de un origen no confiable se usa la IP del socket (`app.ts:76`); ver «IP del cliente» en `docs/security.md`.                                                                                                                                                                        |
| 7   | (ningún documento)                                                         | —                                   | Sin timeouts de conexión ni de consulta en el pool, y el apagado de la API no tiene tope de tiempo (puntos 2). No contradice los docs, pero tampoco está documentado.                                                                                                                                                                    |

Lo que sí coincide con los docs, verificado: argon2id y sus parámetros, 256 bits de token y solo su hash en BD, expiración inactiva/absoluta, invalidaciones, purga horaria, CSRF de doble envío, `audit_log` append-only y el test de permisos por rol en todas las rutas.

## 9. Stack: versiones exactas

Versiones tomadas de `pnpm-lock.yaml` (línea entre paréntesis) y de los `Dockerfile`/compose. Todas las dependencias npm están
fijadas a versión exacta: `savePrefix: ''` (`pnpm-workspace.yaml:18`), `save-exact=true` (`.npmrc:1`), ningún `package.json` usa
rangos y el CI instala con `--frozen-lockfile` (`.github/workflows/ci.yml:28`).

| Componente                                | Versión                                                                                                           | Fuente                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Node (desarrollo y CI)                    | 26.13.1                                                                                                           | `.nvmrc:1`; CI también prueba la `24` (`ci.yml:39`)                   |
| Node (imagen)                             | 26.13.1, `node:26-slim@sha256:e6bedef2…20bc`                                                                      | `Dockerfile:2`                                                        |
| pnpm                                      | 12.21.0                                                                                                           | `package.json:6`, `Dockerfile:6`, `ci.yml:16`                         |
| TypeScript                                | 6.0.3                                                                                                             | lock `:4412`                                                          |
| Vue                                       | 3.5.45                                                                                                            | lock `:4767`                                                          |
| Vite                                      | 8.3.8                                                                                                             | lock `:4617`                                                          |
| Vue Router                                | 5.5.1                                                                                                             | lock `:4743`                                                          |
| Pinia                                     | 4.1.0                                                                                                             | lock `:3909`                                                          |
| vue-i18n                                  | 11.4.20                                                                                                           | lock `:4737`                                                          |
| TanStack Query (Vue)                      | 5.107.1                                                                                                           | lock `:1784`                                                          |
| Nuxt UI                                   | 4.12.0                                                                                                            | lock `:1432`                                                          |
| Tailwind CSS                              | 4.3.5                                                                                                             | lock `:4291`                                                          |
| Fastify                                   | 5.12.8                                                                                                            | lock `:3116`                                                          |
| `@fastify/helmet`                         | 13.2.0                                                                                                            | lock `:1233`                                                          |
| `@fastify/cookie`                         | 11.1.5                                                                                                            | lock `:1212`                                                          |
| `@fastify/csrf-protection`                | 8.0.2                                                                                                             | lock `:1215`                                                          |
| `@fastify/rate-limit`                     | 11.2.2                                                                                                            | lock `:1242`                                                          |
| `@fastify/swagger`                        | 9.9.4                                                                                                             | lock `:1245`                                                          |
| `@fastify/under-pressure`                 | 9.2.1                                                                                                             | lock `:1248`                                                          |
| `fastify-type-provider-zod`               | 7.0.0                                                                                                             | lock `:3108`                                                          |
| `fastify-metrics`                         | 15.0.1                                                                                                            | lock `:3095`                                                          |
| Zod                                       | 4.6.7                                                                                                             | lock `:4884`                                                          |
| Drizzle ORM                               | 0.45.4                                                                                                            | lock `:2765`                                                          |
| drizzle-kit                               | 0.31.11                                                                                                           | lock `:2761`                                                          |
| Driver de Postgres (`pg`)                 | 8.23.1                                                                                                            | lock `:3886`                                                          |
| pg-boss                                   | 12.38.2                                                                                                           | lock `:3857`                                                          |
| argon2                                    | 0.45.2                                                                                                            | lock `:2425`                                                          |
| pino                                      | 10.4.0                                                                                                            | lock `:3925`                                                          |
| Vitest                                    | 5.1.0                                                                                                             | lock `:4660`                                                          |
| Testcontainers                            | 12.2.1                                                                                                            | lock `:4320`                                                          |
| Playwright (`@playwright/test`)           | 1.65.1                                                                                                            | lock `:1517`                                                          |
| axe (`@axe-core/playwright` y `axe-core`) | 4.14.0                                                                                                            | lock `:392` y `:2475`                                                 |
| Imagen de Postgres                        | 18.7, `postgres:18@sha256:2ea8630d…bbc`                                                                           | `compose.yml:22`, `compose.e2e.yml:25`, `apps/api/test/postgres.ts:6` |
| Imagen de Caddy                           | 2.11.9, `caddy:2-alpine@sha256:003a9780…2c0` (verificado ejecutándola)                                            | `Dockerfile:3`                                                        |
| Imagen base de Node                       | `node:26-slim@sha256:e6bedef2…20bc`                                                                               | `Dockerfile:2`                                                        |
| Imagen de Playwright                      | `v1.65.1-noble@sha256:1507cbfc…5579`, igual a la del paquete (lo verifica `scripts/check-playwright-version.mjs`) | `Dockerfile:5`, `ci.yml:29`                                           |
| gitleaks (pre-commit y reglas)            | 8.24.3                                                                                                            | `scripts/gitleaks.sh`, `scripts/test-gitleaks.sh`                     |
| gitleaks (CI, escaneo del PR)             | **sin versión fijada**: `gitleaks/gitleaks-action@v3`                                                             | `ci.yml:101`                                                          |
| OSV-Scanner                               | acción `v2.7.1`                                                                                                   | `ci.yml:96`                                                           |
| Trivy                                     | acción `aquasecurity/trivy-action@v0.36.0`; el binario es el que trae esa acción (no se fija)                     | `ci.yml:126`                                                          |

### Lo que no tiene versión exacta fijada

Ninguna dependencia npm: todas son exactas. Quedan sin fijar o fijadas de forma parcial:

1. **Acciones de GitHub por etiqueta mayor, no por SHA:** `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7`, `docker/setup-buildx-action@v4`, `docker/build-push-action@v7`, `gitleaks/gitleaks-action@v3` (`ci.yml`). Las de OSV y Trivy llevan versión exacta de la acción, pero no del binario/base de datos que descargan.
2. **gitleaks del CI:** la acción elige su binario; solo el de pre-commit y el del test de reglas está fijado (8.24.3, por etiqueta de imagen, sin digest).
3. **Matriz de Node del CI:** `'24'` flota entre parches (`ci.yml:39`); `'26.13.1'` es exacta. `engines` pide rangos mínimos (`node >=24.0.0`, `pnpm >=12.21.0`, `package.json:7-10`), mientras `.nvmrc` y `packageManager` son exactos.
4. **Imagen `api`:** `apt-get upgrade -y` al construirla (`Dockerfile:38-39`) trae los paquetes de Debian vigentes ese día, así que la imagen no es reproducible bit a bit (es deliberado, por parches de seguridad). Además `npm` (solo en las etapas de build) viene de la imagen base.
5. Las imágenes de Postgres, Caddy, Node y Playwright llevan etiqueta **y** digest, por lo que están fijadas de forma exacta; Renovate propone las actualizaciones por PR (`renovate.json`).
