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

## Autorización

- Toda ruta de `/api/v1` declara su acceso (`publicRoute`, `authenticatedRoute`, `requirePermission`). Si una ruta no lo
  declara, la aplicación no arranca (`assertRouteDeclaresAccess`).
- Un test de integración recorre **todas** las rutas registradas contra los 4 roles semilla y contra anónimo.
- El front solo oculta; el backend valida cada petición.

## Auditoría

- Toda escritura de usuarios y roles, y los eventos de autenticación, quedan en `audit_log` (quién, cuándo, IP, acción,
  entidad, diff) en la misma transacción que el cambio. Nunca se guardan contraseñas ni hashes en el diff.
- Append-only: el usuario de BD de la aplicación no tiene `UPDATE`, `DELETE` ni `TRUNCATE` sobre la tabla (verificado en test).

## Excepciones de vulnerabilidades

Cada hallazgo que el CI ignora está aquí, con motivo y fecha de revisión. Al vencer la fecha el CI vuelve a fallar
(OSV: `ignoreUntil`) o se revisa a mano (Trivy). Ninguna afecta a la imagen `api` ni a la ejecución en producción salvo la de Caddy.

| Paquete (versión)                                                                                  | CVE / GHSA                            | Severidad | Por qué no afecta a producción                                                                                                                                                            | ¿Corrección?                                                                               | Revisión                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `esbuild` 0.18.20 (vía `drizzle-kit` → `@esbuild-kit/*`)                                           | GHSA-67mh-4wv8-2f99                   | Media     | Solo afecta al servidor de desarrollo de esbuild, que no se arranca. `drizzle-kit` es dependencia de desarrollo y `pnpm deploy --prod` la excluye de las imágenes.                        | Sí, 0.25.0; `drizzle-kit` aún depende de 0.18.x                                            | 2027-02-16                                                                  |
| `glob` 10.5.0 (vía `testcontainers` → `archiver`) y 13.0.7 (vía `@vue/test-utils` → `js-beautify`) | GHSA-3g3m-2fjr-6pw4 (CVE-2026-118773) | Media     | Fallo al cancelar con `AbortSignal` durante un recorrido de archivos. Solo se usa en pruebas, con rutas propias; no está en las imágenes.                                                 | Sí, 14.0.2; los paquetes padre aún no lo adoptan                                           | 2027-02-16                                                                  |
| `minimatch` 5.1.9, 9.0.9 y 10.2.6 (vía `archiver`, `typescript-eslint`, `js-beautify`)             | GHSA-g3hv-75wg-m249 (CVE-2026-118764) | Media     | Denegación de servicio con patrones glob malintencionados. Los patrones vienen de la configuración del propio repositorio, nunca de entrada de usuarios; solo herramientas de desarrollo. | Sí, 11.0.1; los paquetes padre aún no lo adoptan                                           | 2027-02-16                                                                  |
| `golang.org/x/net` 0.60.0 (dentro de Caddy 2.11.9, imagen `web`)                                   | CVE-2026-78661                        | Alta      | Está en el parser `net/html`; Caddy solo sirve estáticos y hace proxy a la API y no parsea HTML de terceros.                                                                              | Sí, `x/net` 0.62.0, pero la imagen oficial de Caddy (2.11.9, 2026-11-13) aún no lo incluye | **2026-12-16** ([issue #3](https://github.com/cvrsed/inventarius/issues/3)) |

Configuración: `osv-scanner.toml` (las tres primeras) y `.trivyignore` (la última). Q11 y Q22 en `docs/open-questions.md`.

## Pendiente (fases siguientes)

CSP estricta con nonce, cabeceras de producción y revisión de secretos en logs (F4); cifrado AES-256-GCM de claves (F3).
