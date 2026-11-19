# Operación

Tareas de operación que no tienen pantalla. Se ejecutan con el CLI de la API, contra la base de datos configurada en
`DATABASE_URL` (el mismo usuario de BD de la aplicación; no hace falta el migrador).

## Cómo correr el CLI

En desarrollo:

```bash
pnpm --filter @inventarius/api cli <comando> [opciones]
```

En producción, con la imagen `api` (Compose), en el mismo servicio y red que la API:

```bash
docker compose run --rm api node dist/cli.js <comando> [opciones]
```

Código de salida: `0` bien; `1` error de negocio (usuario inexistente, correo ya usado, datos inválidos); `2` uso incorrecto
(faltan opciones). Los mensajes salen por la terminal y nunca incluyen contraseñas.

## `create-admin`: primer administrador (RF-02)

Ver `docs/development.md`. La contraseña nunca va por argumento: se pide sin eco o se toma de una variable de entorno
indicada con `--password-env`. Con `--if-missing`, un correo ya existente no es error.

## `update-email`: cambiar el correo de un usuario

```bash
pnpm --filter @inventarius/api cli update-email --email-actual vieja@empresa.cl --email-nuevo nueva@empresa.cl
```

Úsalo cuando la persona ya no tiene acceso a su correo o cuando hay que cambiar el correo del administrador. Por la
interfaz web nadie puede editar su propio correo (ni un administrador); un administrador cambia el de otras personas
desde **Usuarios**. El CLI cubre el caso que la interfaz no puede: **el único administrador**, de modo que siempre hay
una salida si se pierde el acceso.

Aplica las mismas reglas que la API:

| Regla                     | Resultado                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Correo con formato válido | Si no, error de validación (el correo se guarda en minúsculas)                         |
| Correo nuevo distinto     | Si es igual al actual, error y no se registra nada                                     |
| Correo único              | Si ya lo usa otra cuenta, error de conflicto                                           |
| Usuario existente         | Si no hay una cuenta con el correo actual, error «No existe un usuario con ese correo» |
| Sesiones                  | Se **cierran todas** las sesiones de esa persona; entra de nuevo con el correo nuevo   |
| Auditoría                 | Entrada `user.update` con `before.email` y `after.email`, **actor = `cli`**            |

La entrada de auditoría tiene `actor_id` vacío y `actor_label = 'cli'`; en **Auditoría** se ve como «CLI (operación)».
La contraseña no cambia. Si además hay que restablecerla, un administrador lo hace desde **Usuarios**, o por una
cuenta nueva con `create-admin` si no queda ninguno con acceso.

Ejemplo de salida:

```text
Correo actualizado: vieja@empresa.cl → nueva@empresa.cl. Se cerraron las sesiones de esa persona.
```

## IP del cliente detrás de Caddy y cloudflared

La auditoría registra la IP real del cliente solo si la petición llega por un proxy de confianza. Dos variables:

| Variable               | Dónde         | Qué hace                                                                                                                                              | Por defecto            |
| ---------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `TRUSTED_PROXIES`      | API (`api`)   | Proxies de los que se acepta `X-Forwarded-For`: IP, CIDR o `loopback`, `linklocal`, `uniquelocal`, separados por coma. Vacío = no confiar en ninguno. | `loopback,uniquelocal` |
| `TRUSTED_PROXY_RANGES` | Caddy (`web`) | Quién puede informar la IP del cliente a Caddy (p. ej. el contenedor de cloudflared), separados por espacio.                                          | `private_ranges`       |

- **Producción con Caddy:** deja `TRUSTED_PROXIES` con la IP o subred de la red interna donde está Caddy (p. ej. `172.20.0.0/16`).
- **Con cloudflared** delante de Caddy: pon en `TRUSTED_PROXY_RANGES` la IP de cloudflared; Caddy tomará `CF-Connecting-IP`
  y la reenviará a la API como `X-Forwarded-For`. Si cloudflared no está en esa lista, Caddy usará su IP (la del túnel).
- **Desarrollo:** el proxy de Vite informa la IP del cliente; los valores por defecto sirven.
- **Verificar:** inicia sesión y revisa en Auditoría que la IP sea la de tu equipo y no `172.x`/`10.x` de Docker. Si aparece
  la del proxy, la lista de confianza no incluye a quien conecta a la API.

## Mantenimiento automático

El **worker** (`node dist/worker.js`, servicio `worker` de Compose) ejecuta con pg-boss, cada hora en punto
(`0 * * * *`), la purga de sesiones vencidas (absolutas de 24 h o inactivas de 8 h). No necesita configuración. Los
registros del worker dicen `sesiones vencidas purgadas` con el número borrado. La cola se crea al aplicar las
migraciones (`node dist/migrate.js`); si el worker falla al arrancar con «queue does not exist», faltó migrar.
