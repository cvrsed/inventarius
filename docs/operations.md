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

## `APP_ENCRYPTION_KEY`: clave de cifrado de secretos (F3)

AppKey, NwkKey y las credenciales de los perfiles LNS se guardan cifradas con `APP_ENCRYPTION_KEY` (32 bytes: 64 caracteres
hex o base64). Es obligatoria en producción y **si se pierde, esas claves son irrecuperables**: guárdala en un gestor de
La API y el worker no arrancan en producción si falta o si es la clave de desarrollo que `compose.yml` usa por defecto (está en el repositorio, así que no protege nada).
secretos, aparte de los respaldos de la base (un respaldo de la base sin la clave no revela nada).

Generarla: `openssl rand -hex 32`.

### Rotarla

1. Elegir un nuevo identificador (p. ej. `k2`) y una clave nueva.
2. En el entorno de la API y del worker: `APP_ENCRYPTION_KEY=<nueva>`, `APP_ENCRYPTION_KEY_ID=k2` y
   `APP_ENCRYPTION_KEYS_PREVIOUS=k1=<anterior>` (varias se separan con coma). Reiniciar la API y el worker.
3. Recifrar: `docker compose exec api node dist/cli.js reencrypt-secrets`. Imprime cuántos dispositivos y perfiles recifró.
4. Cuando el comando ya no recifra nada, quitar la clave anterior de `APP_ENCRYPTION_KEYS_PREVIOUS`.

## Registro en el LNS: operación

- El **worker** debe estar corriendo: sin él los registros quedan en «Registrando…». Atiende las colas `lns-register` y
  `lns-deregister` de pg-boss.
- Un registro atascado en `error` o `parcial` se reintenta desde la ficha del activo (**Reintentar**). `parcial` indica qué
  componente quedó huérfano en el LNS (en TTN: Identity, Join, Network o Application Server).
- Ante un conflicto (el DevEUI ya existía en el LNS y no lo creó Inventarius) la ficha ofrece **Vincular** o **Cancelar**.
- Las API keys de los perfiles deben tener el mínimo de derechos: de **tenant** en ChirpStack y de **aplicación** en TTN.
