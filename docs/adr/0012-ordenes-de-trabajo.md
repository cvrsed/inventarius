# ADR 0012 — Órdenes de trabajo: modelo, reservas y libro de consumibles

- Estado: Propuesto
- Fecha: 2026-11-25
- Requerimientos: RF-83, RF-82 (sección 16 del requerimiento); usa RF-23 y RF-70 a RF-74

## Contexto

Las órdenes de trabajo (OT) viven en Inventarius (D2). Reservan, despachan e instalan activos y consumibles. Los activos
tienen asignaciones con bloqueo de fila (ADR 0005); los consumibles, un libro append-only que es la fuente de verdad, un
saldo materializado y devoluciones ligadas a su entrega (ADR 0008).

## Decisión

1. **Módulo `work-orders`** que orquesta los servicios públicos de activos, consumibles, LNS y adjuntos. No escribe tablas
   ajenas. Máquina de estados en el servicio: `draft → reserved → dispatched → closed`, y `cancelled` desde las dos
   primeras (Q102).
2. **Una reserva no es un movimiento.** No cambia el stock físico, así que no entra al libro. Vive en las líneas de la OT;
   `disponible = saldo − reservado vigente`. El libro y `verify-consumables` no cambian de regla.
3. **Las reservas se escriben bajo el mismo candado del stock** (consumible `FOR SHARE`, filas de saldo `FOR UPDATE` en orden
   de id). **Entrega y traslado** validan contra el disponible; el **ajuste** y la **anulación** reflejan hechos y pueden
   dejar reservas sin respaldo, que se muestran como alerta (Q104). El `CHECK (quantity >= 0)` sigue siendo el respaldo del
   saldo.
4. **Activos reservados:** estado del sistema `reserved` («Reservado», no desplegable, no se elige a mano), guardando el
   estado anterior para restaurarlo. Solo el servicio de OT lo pone y lo quita, y las demás vías lo rechazan.
5. **Despacho = movimientos que ya existen:** check-out del activo al técnico y `delivery` del consumible con el técnico
   como receptor, ambos con `work_order_id` (columna opcional que se llena al insertar).
6. **Cierre = devoluciones que ya existen:** lo no usado es un `return` ligado a su entrega (reutiliza el tope «entregado
   menos devuelto»); lo no instalado es un check-in a la bodega base. No hay tipo de movimiento «consumo»: lo consumido es
   entregado menos devuelto.
7. **La instalación** cierra la asignación al técnico y abre la de la ubicación final en una transacción. El **registro en
   el LNS** usa la cola de siempre y queda fuera de esa transacción: un fallo del LNS no deshace la instalación. Las fotos
   se suben aparte.
8. **Permisos de OT bastan para sus movimientos:** el servicio llama a operaciones internas autorizadas por la OT, que
   siguen auditando los eventos de activos y consumibles con el número de OT. Un técnico solo actúa en las suyas.
9. **Movimientos de una OT fuera de la OT:** devolver, anular o hacer check-in a mano de algo ligado a una OT abierta se
   rechaza con el enlace a la OT, para que sus líneas no se desalineen.

## Alternativas descartadas

- **Reservas como movimientos del libro:** mezcla intención con existencia, exige tipos y anulaciones nuevas y rompe
  «saldo = suma del libro».
- **Columna `reserved` en `consumable_stock` como único dato:** rápida, pero sin saber de qué OT es; a lo más, caché.
- **Reservar sin bloquear entregas:** la reserva no garantizaría nada en terreno.
- **Integrar un sistema externo de OT:** descartado por D2.
- **Una «bodega móvil» por técnico:** modela bien lo que anda en la camioneta, pero cambia qué es una bodega (D1 de F3.5).

## Consecuencias

- Los servicios de activos y consumibles necesitan operaciones que acepten una transacción y el contexto de OT, y sus
  validaciones deben conocer lo reservado.
- Todas las pantallas de stock deben distinguir saldo, reservado y disponible; el aviso de mínimo (RF-74) sigue sobre el
  saldo hasta que se decida otra cosa.
- Una OT despachada y no cerrada deja equipos «con el técnico»: hace falta ver las OT antiguas abiertas.
- Una OT usa una sola bodega de origen en v2.
- Las pruebas de concurrencia de F3.5 se amplían con reserva contra entrega, traslado y otra reserva.
