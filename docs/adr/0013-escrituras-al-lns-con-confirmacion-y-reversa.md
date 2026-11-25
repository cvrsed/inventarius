# ADR 0013 — Escrituras al LNS con confirmación y reversa

- Estado: Propuesto
- Fecha: 2026-11-25
- Requerimientos: RF-80, RF-81, RF-84 (sección 16 del requerimiento); usa RF-60 a RF-65
- Si se acepta, **modifica** las decisiones 5 y 12 del ADR 0007

## Contexto

Hoy Inventarius solo escribe en el LNS lo que crea: registra y da de baja sus dispositivos, y vincular es de solo lectura
(ADR 0007). v2 pide cargar datos en dispositivos ajenos (RF-80), crear aplicaciones (RF-84), re-registrar al cambiar de
cliente (RF-84) y registrar gateways (RF-81). Un error aquí puede cortar la comunicación de equipos instalados.

## Decisión

Toda escritura nueva en un LNS cumple este ciclo:

1. **Permiso propio** para lo que va más allá de registrar lo propio: `lorawan:remote:write` y `lns:application:create`
   (solo Administrador por defecto).
2. **Lectura, plan y confirmación.** El servidor lee el remoto y arma un plan (operaciones y campos, antes → después) con
   una huella de lo leído. La misma función arma lo que se muestra y lo que se ejecuta (como `outgoingDevice`). Confirmar
   envía la huella; si el remoto cambió, se rechaza y se vuelve a confirmar. Cargar claves exige una **segunda
   confirmación**, validada también en la API.
3. **Estado previo guardado antes de escribir**, en la base y solo de los campos del plan. Las claves nunca en claro: si un
   valor previo fuera secreto, se cifra como la AppKey.
4. **Cola y worker**, idempotente, reintento solo ante errores transitorios, con registro de lo ya aplicado.
5. **Alcance mínimo:** en lo ajeno, solo se **completan campos en blanco** que el usuario eligió. En ChirpStack,
   leer-modificar-escribir conservando el resto; en TTN, `field_mask` exacto.
6. **Reversa** del estado previo, con su propia confirmación, solo si el remoto sigue como lo dejó Inventarius. No
   sobrescribe cambios ajenos.
7. **Auditoría** de la intención confirmada, el resultado y la reversa, sin valores de claves.

Lo que **no cambia:** un dispositivo vinculado nunca se borra; nunca recibe la marca `inventarius_asset_id` (la
idempotencia lo creería propio y podría borrarlo); no se borra ninguna aplicación.

**Operaciones que no son reversibles** (y la confirmación lo dice):

- **Re-registro** (borrar y crear en otra aplicación): se puede volver a crear en la de origen, pero la sesión, los
  contadores y el historial en el LNS se pierden. Solo para lo creado por Inventarius, comprobando antes de borrar el
  registro local y la marca leída del LNS (Q129). Si falla el alta, el activo queda en `error`, reintentable.
- **Crear una aplicación:** Inventarius no la borra. Antes de crear se busca una con el mismo id o nombre, para no duplicar.

## Alternativas descartadas

- **Mantener todo lo vinculado como solo lectura:** es lo más seguro, pero no cumple RF-80.
- **Sincronización automática o bidireccional:** escribe sin que nadie mire.
- **Respaldar el dispositivo completo y restaurarlo entero:** pisaría cambios posteriores y obligaría a copiar sus claves.
- **Sobrescribir valores distintos «porque Inventarius manda»:** el LNS en producción puede ser el dato correcto.
- **Aprobación por una segunda persona:** es el flujo de bajas con aprobación del backlog; no se exige aquí (Q97).

## Consecuencias

- «Revertir» no es un deshacer perfecto: no recupera sesiones ni uplinks perdidos, y puede negarse a actuar.
- Cada operación y cada campo necesitan prueba contra un ChirpStack real; TTN sigue sin verificarse contra una aplicación
  real (Q48 de F3).
- El contrato `LnsAdapter` crece (actualizar, claves, aplicaciones, gateways) y conviene separarlo por capacidades, para que
  cada adaptador declare las que soporta y la UI desactive el resto con el motivo.
- La credencial necesita más derechos que hoy; en TTN, otras credenciales (Q94). Ampliar derechos aumenta el daño si se
  filtran.
