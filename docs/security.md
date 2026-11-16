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
  su contraseña.

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

## Pendiente (fases siguientes)

CSP estricta con nonce, cabeceras de producción y revisión de secretos en logs (F4); cifrado AES-256-GCM de claves (F3).
