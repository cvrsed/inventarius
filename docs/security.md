# Seguridad: controles implementados

Referencia: sección 10 del requerimiento. Este documento crece por fase; aquí lo que existe tras F1.

## Contraseñas

- argon2id con parámetros OWASP (19 MiB, 2 iteraciones, 1 hilo). Mínimo 12 caracteres, lista de contraseñas comunes
  (incluye variantes con dígitos/símbolos), no igual al correo, no un solo carácter repetido.
- Contraseña temporal (reseteo por administrador): 20 caracteres aleatorios, de un uso (`must_change_password`),
  se muestra una sola vez y cierra las sesiones de la persona.

## Sesiones

- Token aleatorio de 256 bits en cookie `HttpOnly`, `SameSite=Strict`, `Secure` y prefijo `__Host-` (producción).
- En la BD solo se guarda el SHA-256 del token. Cada login crea una sesión nueva (rotación).
- Expiración inactiva (8 h por defecto) y absoluta (24 h). Se invalidan al desactivar al usuario, al resetear o cambiar
  su contraseña, y al cambiar su correo. Las vencidas se purgan cada hora (job de pg-boss).

## CSRF, fuerza bruta y límites

- Token CSRF de doble envío (`@fastify/csrf-protection`) en toda petición que cambia estado, además de `SameSite=Strict`.
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

Configuración: `osv-scanner.toml` (las cuatro primeras) y `.trivyignore` (la última). Q11 y Q22 en `docs/open-questions.md`.

## Pendiente (fases siguientes)

CSP estricta con nonce, cabeceras de producción y revisión de secretos en logs (F4); cifrado AES-256-GCM de claves (F3).
