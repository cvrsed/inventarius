# ADR 0007 — LoRaWAN, secretos y registro en el LNS (F3)

- Estado: aceptada
- Fecha: 2026-11-19

## Contexto

F3 agrega los datos LoRaWAN del activo (RF-21), los perfiles de Network Server (RF-50 a RF-52), el registro y la baja de
dispositivos en ChirpStack v4 y TTN v3 (RF-60 a RF-65) y la importación CSV (RF-66). Maneja claves de dispositivos
(AppKey, NwkKey) y credenciales de LNS, y habla con sistemas externos que pueden fallar a mitad de una operación.

## Decisiones

1. **Cifrado en reposo con `SecretBox` (AES-256-GCM).** IV aleatorio de 12 bytes por valor; se guarda `iv | tag | texto`
   en `bytea` y el `key_id` en la fila. El AAD es `tabla:id:columna` (el requerimiento pide tabla + id; se agrega la
   columna para que `app_key` y `nwk_key` de una misma fila no se puedan intercambiar). `APP_ENCRYPTION_KEY` (32 bytes,
   hex o base64) es obligatoria en producción; las claves anteriores se listan en `APP_ENCRYPTION_KEYS_PREVIOUS` y
   `cli reencrypt-secrets` recifra todo con la vigente.
2. **Las claves no salen de la API salvo por el reveal.** `POST /assets/:id/lorawan/reveal` exige `lorawan:keys:reveal`,
   responde con `Cache-Control: no-store` y deja un registro `lorawan.reveal_keys` (quién, IP, cuándo, qué claves, nunca el
   valor). Las ediciones auditan solo «la clave cambió». Los perfiles LNS devuelven `•••• últimos4`.
3. **Un registro por activo (`lns_registrations.asset_id` único, RF-65).** El estado vive en la base: `registering`,
   `registered`, `error`, `partial`, `conflict` y `deregistering`. «No registrado» es la ausencia de fila. La API cambia el
   estado y encola; el worker habla con el LNS. Así un reinicio del worker no pierde la operación.
4. **Cola pg-boss, un job por operación.** Colas `lns-register` y `lns-deregister`, creadas por el migrador (el worker y la
   API solo tienen DML). Los jobs son idempotentes: si el registro ya no está en el estado esperado, no hacen nada.
   Reintentos con espera creciente solo para errores transitorios (timeout, 5xx, `UNAVAILABLE`); el servicio cuenta los
   intentos y se rinde en `LNS_MAX_ATTEMPTS`. Los demás errores no se reintentan (RF-63).
5. **Idempotencia y conflicto (RF-64).** Antes de crear se consulta si el DevEUI existe. Si existe y lo marcó Inventarius
   (`inventarius_asset_id`), pero el registro no está completo (el worker cayó a medias), se limpia lo propio y se vuelve a
   registrar. Si no lo creó Inventarius: `conflict`, con **Vincular** (se toma como registrado sin tocarlo) o **Cancelar**.
   Dar de baja un dispositivo vinculado solo lo desvincula: nunca se borra en el LNS algo que Inventarius no creó.
6. **Compensación dentro del adaptador (sección 5.5).** `registerDevice` deshace lo ya creado si falla un paso. TTN borra
   AS → NS → JS → IS; ante un fallo sin respuesta (timeout) también intenta borrar el paso ambiguo. Si el borrado falla, el
   error trae `orphans` y el registro queda `partial` con el detalle de qué componente quedó huérfano. ChirpStack borra el
   dispositivo si falla `CreateKeys`.
7. **Un error del adaptador es un `LnsOperationError`** (`transient`, `conflict`, `stepsDone`, `orphans`). Cualquier otro
   error es inesperado: se registra en el log del servidor y el usuario ve un mensaje genérico, sin detalles internos.
8. **Cambios de identidad bloqueados mientras el dispositivo existe en el LNS.** DevEUI, JoinEUI y claves no se editan con el
   registro en `registered`, `registering`, `deregistering` o `partial`; el activo tampoco se da de baja (RF-25).
9. **Cliente de ChirpStack: gRPC oficial** (`@chirpstack/chirpstack-api` + `@grpc/grpc-js`); una conexión por operación.
   Requiere `google-protobuf` (dependencia opcional del paquete oficial) y sus tipos. **TTN: REST con `fetch`** nativo, sin
   dependencias nuevas.
10. **Importación CSV todo o nada (RF-66).** Vista previa y aplicación comparten el mismo análisis; la aplicación corre en una
    transacción y, con cualquier error de archivo o de fila, responde 422 sin escribir nada. Tope de 2.000 filas.

## Hallazgos contra un ChirpStack v4.20 real

Los dobles no los habrían encontrado; están cubiertos por `chirpstack.real.int.test.ts` y el e2e:

- En 1.0.x la AppKey se guarda en `nwk_key` (la UI la muestra como «Application key»); en 1.1 van `nwk_key` y `app_key`.
  Verificado leyendo las claves de vuelta con `DeviceService.GetKeys`.
- Con una API key de **tenant**, `Get` y `Delete` de un dispositivo inexistente responden `UNAUTHENTICATED`, no `NOT_FOUND`.
  Se distingue de una credencial inválida probando un recurso propio (la aplicación del perfil).
- Un DevEUI repetido responde `INTERNAL` con «duplicate key», no `ALREADY_EXISTS`: se trata como conflicto y no se reintenta.
- `DeviceService.List` con `search` no busca por DevEUI, así que no sirve para comprobar existencia.

## Consecuencias

- Perder `APP_ENCRYPTION_KEY` hace irrecuperables las claves y credenciales: la clave se respalda aparte de la base.
- Un job perdido (cola caída justo al encolar) deja el registro en `error` con «No se pudo encolar»; se reintenta a mano.
  Un worker que muere a mitad deja el job tomado por pg-boss, que lo vuelve a entregar al vencer su plazo.
- Los campos de TTN (`field_mask`, atributos) siguen sin verificarse contra una aplicación real hasta el job manual `ttn-real`.
