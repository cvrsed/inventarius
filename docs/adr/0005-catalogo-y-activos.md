# ADR 0005 — Catálogo y activos (F2)

- Estado: aceptada
- Fecha: 2026-11-16

## Contexto

F2 agrega el catálogo (categorías, fabricantes, modelos, ubicaciones, estados) y los activos con asignación, baja lógica,
historial y exportación (RF-10 a RF-26). Hay decisiones de diseño que el requerimiento no fija y que conviene dejar escritas.

## Decisiones

1. **El historial del activo sale de auditoría, no de una tabla propia (RF-24).** Cada alta, cambio, asignación, devolución,
   baja y restauración ya registra en `audit_log` (misma transacción que el cambio) con antes/después y nombres legibles.
   `GET /assets/:id/history` filtra `audit_log` por `entity = 'asset'` y `entity_id`, a través de `AuditService`. Una tabla
   `asset_history` duplicaría el dato y podría desalinearse. Las operaciones LNS de F3 se registrarán igual.
   `asset_assignments` guarda las asignaciones (abierta y cerradas) por separado porque es estado de negocio, no rastro.
2. **El estado «Asignado» es del sistema (`status_labels.system_key = 'assigned'`).** El check-out lo pone y no se puede
   renombrar, desactivar ni borrar; nadie lo elige a mano. El resto de los estados se identifica por tipo (`kind`), no por
   nombre, así que se pueden renombrar. Un activo asignado no cambia de estado ni se da de baja hasta devolverlo.
3. **Dos asignaciones simultáneas no se cruzan:** el check-out bloquea la fila del activo (`SELECT … FOR UPDATE`) y un
   índice único parcial sobre asignaciones abiertas es el respaldo.
4. **Un solo listado paginado con JOIN de solo lectura.** `assets` se lista uniendo modelo, categoría, estado, ubicación y
   usuario asignado en una consulta, porque filtrar y ordenar por esos nombres no se puede resolver llamando a otros
   servicios sin romper la paginación (RNF-06). Las escrituras y las validaciones de referencias sí pasan por
   `CatalogService`/`UsersService` (ningún módulo escribe tablas de otro).
5. **Búsqueda con `pg_trgm`.** Índices GIN trigram sobre etiqueta, nombre y serie; `ILIKE '%término%'` con comodines
   escapados. Con 10.000 activos el peor p95 medido es ~70 ms (ver `docs/progress.md`).
6. **Catálogo genérico.** Las cinco entidades comparten `CatalogEntity` (versión optimista con `If-Match`, unicidad, borrado
   solo si no está en uso, auditoría). Lo propio de cada una (valores LoRaWAN del modelo, ciclos en ubicaciones, estado del
   sistema) va en ganchos `beforeCreate`/`beforeUpdate`/`beforeDelete`.
7. **Restaurar es de administrador:** nuevo permiso `asset:restore` (solo Administrador), en vez de reutilizar uno ajeno.
8. **Estado de los listados en la URL** (`page`, `pageSize`, `q`, `sort`, filtros): lo que es el valor por defecto no se
   escribe. Los selectores con búsqueda consultan al servidor (los listados se limitan a 100).

## Consecuencias

- Agregar un campo auditable a un activo = sumarlo a `snapshot()` en el servicio; el historial lo muestra solo.
- La auditoría crece con cada operación de inventario; si pesa, se particiona por fecha (no hace falta en el MVP).
- Los filtros `estado LNS` y la búsqueda por DevEUI de RF-22 quedan para F3, cuando exista `asset_lorawan`.
