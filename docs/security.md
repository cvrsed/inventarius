# Seguridad: controles implementados

Referencia: sección 10 del requerimiento. Este documento crece por fase; aquí lo que existe tras F1.

## Contraseñas

- argon2id con parámetros OWASP (19 MiB, 2 iteraciones, 1 hilo). Mínimo 12 caracteres, lista de contraseñas comunes
  (incluye variantes con dígitos/símbolos), no igual al correo, no un solo carácter repetido.
- Contraseña temporal (reseteo por administrador): 20 caracteres aleatorios, de un uso (`must_change_password`),
  se muestra una sola vez y cierra las sesiones de la persona.

## Sesiones

- Token aleatorio de 256 bits en cookie `HttpOnly` y `SameSite=Strict`, sin `Max-Age` (cookie de sesión del navegador).
- `Secure` y el prefijo `__Host-` se activan **solo en producción** (o con `SESSION_COOKIE_SECURE=true`). Motivo: los
  navegadores rechazan las cookies `Secure` y `__Host-` sin HTTPS, y en desarrollo local y en la red interna de Compose
  (e2e) se llega por HTTP. En producción el túnel hacia Internet termina TLS, por lo que se exige.
- En la BD solo se guarda el SHA-256 del token. Cada login crea una sesión nueva (rotación) y **revoca en la misma
  transacción la sesión previa que traía la cookie**; un login fallido no revoca nada.
- Expiración inactiva (8 h por defecto) y absoluta (24 h). Se invalidan al desactivar al usuario, al resetear o cambiar
  su contraseña, y al cambiar su correo. Las vencidas se purgan cada hora (job de pg-boss).

## CSRF, fuerza bruta y límites

- Token CSRF firmado: HMAC-SHA256, con el secreto `CSRF_SECRET` (obligatorio en producción, mínimo 32 caracteres), del id
  de la sesión; antes del login, de una cookie anónima aleatoria. Se envía en la cabecera `x-csrf-token` y se valida en
  todo método no seguro de `/api/v1`, incluido el login, antes de validar el cuerpo. Un token válido de otra sesión, o el
  anterior al login, se rechaza (403). Se complementa con `SameSite=Strict`.
- Bloqueo progresivo por cuenta (5 fallos) y por IP (20), con tope; las claves no revelan si la cuenta existe y la respuesta
  de error es idéntica para cuenta inexistente o contraseña incorrecta (se iguala también el tiempo de hash).
- Rate limit global por IP y específico en el login.

## IP del cliente (proxies de confianza)

La IP que queda en la auditoría y que usan el bloqueo por IP y el rate limit es la del **cliente real**, sin que
nadie pueda falsearla con una cabecera:

- Fastify solo cree en `X-Forwarded-For` cuando la conexión viene de un proxy de la lista `TRUSTED_PROXIES` (IP, CIDR o
  `loopback`/`linklocal`/`uniquelocal`, separados por coma; valor por defecto `loopback,uniquelocal`: localhost y las
  redes privadas de Compose). De cualquier otro origen se usa la IP del socket y la cabecera se ignora. Una lista
  vacía desactiva la confianza. En producción conviene acotarla a la IP de Caddy.
- Caddy (el proxy de producción) solo acepta las cabeceras de IP de quien conecte desde `TRUSTED_PROXY_RANGES`
  (por defecto `private_ranges`) y prefiere `CF-Connecting-IP` (túnel de cloudflared) sobre `X-Forwarded-For`; de un
  origen no confiable las descarta y reenvía a la API la IP del socket.
- En desarrollo el proxy de Vite añade `X-Forwarded-For` (`xfwd`).
- Test: `trusted-proxy.int.test.ts` comprueba que una petición con `X-Forwarded-For` falso desde un origen no confiable
  registra la IP del socket, y que desde el proxy conocido se registra la del cliente.
- Requisito: la API no debe ser alcanzable desde fuera sin pasar por el proxy (en Compose de producción no publica puertos).

## Barrido de información sensible (2026-11-17)

Alcance: el árbol actual y **todo el historial** (todas las ramas, 105 commits, también autores y mensajes) con las reglas de
`.gitleaks.toml` (por defecto + IPs 192.168/16 y 10/8, dominios reales, hex de 16/32 caracteres) y con búsquedas de nombres de
infraestructura, clientes y correos. No se reescribió historial ni se borró nada; esto es el reporte y mi recomendación. Los
hallazgos históricos ya revisados están en `.gitleaksignore` para que el CI no falle por ellos.

Resultado: **ninguna credencial, DevEUI, JoinEUI ni AppKey real**; ningún secreto en código, tests, fixtures ni mensajes de commit.
Sí hay información de infraestructura y de terceros, casi toda en `docs/requirements.md`.

| #   | Hallazgo                                                                                                                                                | Dónde (archivo, commit)                                                                                                      | Qué es                                                                                                                 | Estado y recomendación                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Dominio real de producción (3 apariciones)                                                                                                              | `docs/requirements.md` líneas 9, 481 y 558 del commit `a996fb5d` (documento original)                                        | Dominio de la app y de su despliegue                                                                                   | **Corregido en el árbol** (sección 12 y menciones de las secciones 1 y 8 ahora genéricas). Queda en el historial: **no reescribir**; un dominio público no es secreto, solo da contexto.                                                                                                             |
| 2   | Rango de red local con máscara (1)                                                                                                                      | `docs/requirements.md` línea 550 del commit `a996fb5d`                                                                       | Subred interna del homelab en la regla de firewall de la VM                                                            | **Corregido en el árbol.** Queda en el historial; riesgo bajo (RFC 1918, sin ruta desde Internet). Reescribir solo si el repo pasa a ser público.                                                                                                                                                    |
| 3   | Nombres de infraestructura: nombre del túnel, ID del contenedor de cloudflared, nombre del host de virtualización, monitor externo y monitoreo previsto | `docs/requirements.md` líneas 248-249, 269, 278-279, 515, 550, 660, 672 (árbol actual) y `docs/adr/0001-monolito-modular.md` | Nombres de VM/CT y de servicios del homelab                                                                            | **Corregido** en `docs/requirements.md` y en los ADR (descripciones por rol). Queda en el historial; no reescribir.                                                                                                                                                                                  |
| 4   | Nombre de la empresa cliente, de una persona del cliente y de otro repositorio del homelab                                                              | `docs/requirements.md` líneas 293, 298, 313, 550, 655, 667; `docs/adr/0003-ui-primevue-styled.md`                            | Identifica al cliente y a quien propuso el stack                                                                       | **Corregido** en `docs/requirements.md` y en los ADR («el cliente», «el proveedor del stack sugerido»). Queda en el historial; no reescribir.                                                                                                                                                        |
| 5   | Correo personal en metadatos de commit                                                                                                                  | Commits de merge `ce63b76` y `5c425e0` (PR #1 y #2, hechos desde la web de GitHub)                                           | El autor de esos 2 merges usa un correo personal (dominio gmail) en lugar del `noreply` que usan los otros 103 commits | **No reescribir** (rompería los PR). Activar «Keep my email addresses private» y «Block command line pushes that expose my email» en GitHub, para que no se repita.                                                                                                                                  |
| 6   | IPs `10.x.x.x` en tests (≈40 apariciones en 17 archivos de `apps/api` y `AuditPage.test.ts`)                                                            | Archivos `*.test.ts` y `apps/api/test/app.ts`                                                                                | IPs de cliente **inventadas** para probar el bloqueo por IP y la lista de proxies; no son de la red real               | **Aceptado.** Las pruebas de rango privado necesitan IPs privadas y las de bloqueo, IPs distintas. Si se quiere uniformar, migrar a `192.0.2.0/24` donde no se pruebe «privado». La allowlist de tests cubre todas las reglas (limitación de gitleaks 8.24: no admite excepciones por regla y ruta). |
| 7   | Hex de 32 caracteres en `pnpm-lock.yaml` (2)                                                                                                            | `pnpm-lock.yaml`                                                                                                             | Hashes de integridad, no claves                                                                                        | Falso positivo: archivo en la allowlist.                                                                                                                                                                                                                                                             |
| 8   | Nombres de equipos reales: SDM530-LR                                                                                                                    | `docs/requirements.md` D2 y fixtures de modelo                                                                               | Modelo de medidor comercial                                                                                            | Información de producto, no sensible. Sin acción.                                                                                                                                                                                                                                                    |

Sin hallazgos en: mensajes de commit, `compose*.yml`, `deploy/`, `scripts/`, `.github/`, `.env.example`, fixtures de e2e.

Cómo repetirlo: `pnpm gitleaks` (historial completo), `scripts/gitleaks.sh staged` (lo que se va a commitear) y
`pnpm test:gitleaks` (comprueba que cada regla salta y que los fixtures inventados de `e2e/` y `*.test.ts` no).

## Topes de BD, apagado y cadena de suministro

- Cada conexión de la API, el worker y el CLI lleva `connectionTimeoutMillis` (5 s), `statement_timeout` (30 s) e
  `idle_in_transaction_session_timeout` (30 s), configurables con `DB_CONNECTION_TIMEOUT_MS`, `DB_STATEMENT_TIMEOUT_MS` y
  `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` (`0` = sin tope). Tests: `apps/api/src/core/db/timeouts.int.test.ts`.
- El apagado ordenado de la API y del worker tiene un tope (`SHUTDOWN_TIMEOUT_MS`, 10 s): pasado, el proceso termina igual
  con código 1 (`apps/api/src/core/shutdown.ts`).
- Las acciones de GitHub del CI van fijadas por SHA de commit con la versión en comentario; un script del CI falla si alguna
  no lo está y Renovate las actualiza agrupadas.

## Autorización

- Toda ruta de `/api/v1` declara su acceso (`publicRoute`, `authenticatedRoute`, `requirePermission`). Si una ruta no lo
  declara, la aplicación no arranca (`assertRouteDeclaresAccess`).
- Un test de integración recorre **todas** las rutas registradas contra los 4 roles semilla y contra anónimo.
- El front solo oculta; el backend valida cada petición.

## Auditoría

- Toda escritura de usuarios y roles, y los eventos de autenticación, quedan en `audit_log` (quién, cuándo, IP, acción,
  entidad, diff) en la misma transacción que el cambio. Nunca se guardan contraseñas ni hashes en el diff.
- Append-only: el usuario de BD de la aplicación no tiene `UPDATE`, `DELETE` ni `TRUNCATE` sobre la tabla (verificado en test).

## Inventario (F2)

- **Permisos por ruta:** lectura de activos y catálogo con `asset:read`; escritura de activos `asset:write`; asignar y devolver
  `asset:checkout`; baja `asset:delete`; restaurar `asset:restore` (solo Administrador); catálogo `catalog:write`. El test de
  permisos por rol recorre todas las rutas nuevas y falla si alguna no declara su acceso.
- **Exportación CSV (RF-26):** exige `asset:read`, nunca incluye claves ni secretos y neutraliza las celdas que empiezan con
  `=`, `+`, `-`, `@`, tab o retorno (inyección de fórmulas al abrir en una planilla). Respuesta con `Cache-Control: no-store`.
- **Búsqueda y orden:** los comodines `%` y `_` del texto buscado se escapan; el orden solo acepta columnas de una lista
  blanca (nunca se interpola texto del usuario en `ORDER BY`).
- **Concurrencia:** `PATCH` con `If-Match`; la asignación bloquea la fila del activo y un índice único parcial impide dos
  asignaciones abiertas del mismo activo.
- **Datos personales:** `GET /assignees` entrega solo id y nombre (no correo) de usuarios activos, a quien puede asignar.
- **Auditoría:** toda escritura de catálogo y activos queda en `audit_log` dentro de la misma transacción (RF-30).

## LoRaWAN y secretos (F3)

- **Cifrado en reposo:** AppKey, NwkKey y credenciales de LNS con AES-256-GCM (`SecretBox`), IV aleatorio por valor, AAD
  `tabla:id:columna` y `key_id` por fila para rotar. La clave maestra `APP_ENCRYPTION_KEY` solo vive en el entorno del
  servidor (obligatoria en producción) y no se respalda junto a la base. Rotación: agregar la nueva como vigente, dejar la
  anterior en `APP_ENCRYPTION_KEYS_PREVIOUS` y ejecutar `cli reencrypt-secrets` (ver `docs/operations.md`).
- **Reveal (RF-30):** solo con `lorawan:keys:reveal`, por `POST` con `Cache-Control: no-store`, auditado con quién, IP y qué
  claves (nunca el valor). La web guarda las claves solo mientras el diálogo está abierto.
- **Las claves y credenciales no aparecen** en respuestas de la API, exportaciones CSV, auditoría, historial ni logs: las
  respuestas traen `hasAppKey`/`hasNwkKey` y `•••• últimos4`. Las pruebas de integración revisan la tabla `audit_log` completa
  tras operar con claves reales de prueba. El mensaje de un error del LNS nunca incluye la credencial.
- **Permisos:** `asset:write` edita los datos (las claves son de solo escritura); `lorawan:register` registra y da de baja;
  `lns_profile:manage` administra perfiles (el diálogo de registro usa `/lns-profiles/options`, que no expone destino ni
  credencial). El test de permisos por rol recorre las rutas nuevas.
- **Importación CSV:** el archivo viaja en el cuerpo de la petición (tope de 3 MB), se valida entero antes de escribir y la
  auditoría guarda solo cantidad y series; los valores de claves no se registran.
- **Llamadas salientes:** solo a los endpoints de los perfiles que administra un administrador (RF-50); cada llamada tiene tope
  de tiempo. La API key de ChirpStack debe ser de tenant (mínimo derecho) y la de TTN, de una aplicación.
- **Pruebas:** todo identificador de prueba es inventado; el ChirpStack de prueba usa credenciales ficticias (`deploy/chirpstack/`)
  y no debe exponerse fuera de la red de Compose.

## Consumibles (F3.5)

- **Permisos separados** (`consumables:read|manage|receive|deliver|transfer|adjust`); ajustar y anular el stock es solo del
  Administrador por defecto. `permissions.int.test.ts` recorre cada ruta nueva contra los cuatro roles y el anónimo.
- **Libro append-only:** `inventarius_app` no tiene `UPDATE`, `DELETE` ni `TRUNCATE` sobre `consumable_movements`; un test
  intenta ambos como la app y espera `42501`. Un movimiento solo se «corrige» con una anulación ligada, con motivo y actor.
- **Integridad:** saldo con `CHECK (quantity >= 0)`, anulación única por `UNIQUE (reverses_id)` y concurrencia con bloqueo de
  fila; todo verificado con pruebas simultáneas reales. `cli verify-consumables` detecta un saldo editado a mano.
- **Datos personales:** el receptor de una entrega puede ser un nombre y un identificador en texto libre; son datos de una
  persona, así que no se exportan ni se usan fuera del historial del consumible y la auditoría.

## Excepciones de vulnerabilidades

Cada hallazgo que el CI ignora está aquí, con motivo y fecha de revisión. Al vencer la fecha el CI vuelve a fallar
(OSV: `ignoreUntil`) o se revisa a mano (Trivy). Ninguna afecta a la imagen `api` ni a la ejecución en producción salvo la de Caddy.

| Paquete (versión)                                                                                  | CVE / GHSA                            | Severidad       | Por qué no afecta a producción                                                                                                                                                                                                       | ¿Corrección?                                                                               | Revisión                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `esbuild` 0.18.20 (vía `drizzle-kit` → `@esbuild-kit/*`)                                           | GHSA-67mh-4wv8-2f99                   | Media           | Solo afecta al servidor de desarrollo de esbuild, que no se arranca. `drizzle-kit` es dependencia de desarrollo y `pnpm deploy --prod` la excluye de las imágenes.                                                                   | Sí, 0.25.0; `drizzle-kit` aún depende de 0.18.x                                            | 2027-02-16                                                                  |
| `glob` 10.5.0 (vía `testcontainers` → `archiver`) y 13.0.7 (vía `@vue/test-utils` → `js-beautify`) | GHSA-3g3m-2fjr-6pw4 (CVE-2026-118773) | Media           | Fallo al cancelar con `AbortSignal` durante un recorrido de archivos. Solo se usa en pruebas, con rutas propias; no está en las imágenes.                                                                                            | Sí, 14.0.2; los paquetes padre aún no lo adoptan                                           | 2027-02-16                                                                  |
| `minimatch` 5.1.9, 9.0.9 y 10.2.6 (vía `archiver`, `typescript-eslint`, `js-beautify`)             | GHSA-g3hv-75wg-m249 (CVE-2026-118764) | Media           | Denegación de servicio con patrones glob malintencionados. Los patrones vienen de la configuración del propio repositorio, nunca de entrada de usuarios; solo herramientas de desarrollo.                                            | Sí, 11.0.1; los paquetes padre aún no lo adoptan                                           | 2027-02-16                                                                  |
| `esbuild` 0.27.7 (vía `@nuxt/ui` → `@nuxt/fonts` → `fontless`)                                     | GHSA-g7r4-m6w7-qqqr                   | Baja (CVSS 2,5) | Lectura arbitraria de archivos solo en el servidor de desarrollo de esbuild **en Windows**. Es una dependencia de build de la UI: el modo Vue + Vite de Nuxt UI no activa el plugin de fuentes y no entra a las imágenes de runtime. | Sí, 0.28.1; `fontless` aún no lo adopta                                                    | 2027-02-16                                                                  |
| `golang.org/x/net` 0.60.0 (dentro de Caddy 2.11.9, imagen `web`)                                   | CVE-2026-78661                        | Alta            | Está en el parser `net/html`; Caddy solo sirve estáticos y hace proxy a la API y no parsea HTML de terceros.                                                                                                                         | Sí, `x/net` 0.62.0, pero la imagen oficial de Caddy (2.11.9, 2026-11-13) aún no lo incluye | **2026-12-16** ([issue #3](https://github.com/cvrsed/inventarius/issues/3)) |
| `stdlib` de Go 1.27.3 (dentro de Caddy 2.11.9, imagen `web`)                                       | CVE-2026-97054                        | Alta            | Un servidor HTTP/1 que supera el límite de `http.MaxBytesReader` no cierra la conexión como debería. Caddy solo sirve estáticos y hace proxy, y no configura `request_body max_size`, así que no usa `MaxBytesReader`.               | Sí, Go 1.27.4 (o 1.26.11), pero la imagen oficial de Caddy 2.11.9 aún no lo incluye        | **2026-12-16** ([issue #3](https://github.com/cvrsed/inventarius/issues/3)) |

Configuración: `osv-scanner.toml` (las cuatro primeras) y `.trivyignore` (la última). Q11 y Q22 en `docs/open-questions.md`.

## Pendiente (fases siguientes)

CSP estricta con nonce, cabeceras de producción y revisión de secretos en logs (F4); cifrado AES-256-GCM de claves (F3).
