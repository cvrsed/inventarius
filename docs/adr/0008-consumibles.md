# ADR 0008 — Consumibles por cantidad (F3.5)

- Estado: aceptada
- Fecha: 2026-11-20

## Contexto

F3.5 agrega consumibles que se cuentan por cantidad (EPP, repuestos): catálogo, ingreso a bodega, entrega a una persona,
stock por bodega y stock mínimo (RF-70 a RF-74). A diferencia de un activo, un consumible no tiene identidad por unidad:
lo que importa es cuánto hay en cada bodega y cómo llegó a ese número.

## Decisiones

> **Actualizada por la revisión manual del PR #7** (decisiones de Rodrigo, 2026-11-20): devolución como movimiento propio,
> permisos de ajustar y anular separados, fecha pasada solo en el ingreso, bodega inactiva con stock y traslado como una sola
> entrada del historial. Los cambios están marcados con «(revisión)» en cada decisión; el detalle y los motivos, en
> `docs/open-questions.md` (Q57, Q60, Q63, Q65 y Q70 a Q74).

1. **El libro de movimientos es la fuente de verdad (D2).** `consumable_movements` es append-only: la app no tiene
   `UPDATE` ni `DELETE` sobre ella (el migrador los revoca, igual que en `audit_log`). Cada fila lleva un `delta` con signo
   respecto de una bodega; el saldo de una bodega es la suma de sus `delta`. Tipos: `receipt`, `delivery`, **`return`
   (revisión)**, `adjustment`, `transfer_out`, `transfer_in` y `reversal`. Los `CHECK` de la tabla fijan el signo de cada tipo,
   el receptor de una entrega o devolución (usuario **o** nombre), el motivo de un ajuste, que una anulación lleve motivo y que
   una devolución apunte a su entrega (`returns_id`). Migración 0018.
2. **Saldo materializado en `consumable_stock`.** Se actualiza en la misma transacción que el movimiento y tiene
   `CHECK (quantity >= 0)`. Existe porque listar y validar contra una suma del libro entero no escala y porque da una fila
   que bloquear. `cli verify-consumables` y un test de integración comprueban que cada saldo es igual a la suma del libro.
3. **Concurrencia (D3).** Un movimiento toma el consumible `FOR SHARE` (no se puede desactivar a mitad de camino) y luego
   las filas de saldo que toca con `FOR UPDATE` **en orden de id**: dos entregas sobre el mismo saldo se serializan y dos
   traslados en sentidos opuestos no se bloquean entre sí. Dentro de la transacción todo usa la misma conexión (nunca se
   vuelve al pool: con el pool agotado por transacciones en espera sería un interbloqueo). Pruebas con diez entregas, ocho
   traslados cruzados y entregas contra una anulación, todas simultáneas y contra Postgres real.
4. **Anulación (D7).** No se edita ni se borra: se crea el movimiento inverso con `reverses_id` hacia el original
   (`UNIQUE`: se anula una sola vez) y un motivo obligatorio. Una anulación no se anula. Anular un traslado revierte las dos
   bodegas, desde cualquiera de sus lados, en una transacción; si algún saldo quedara negativo se rechaza entero. **(revisión)**
   Devolver (parte de) una entrega es un movimiento propio, positivo y ligado a ella, que hereda el receptor y no pasa de lo
   entregado menos lo ya devuelto; una entrega con devoluciones vigentes no se anula (primero se anulan las devoluciones). Las
   devoluciones y las anulaciones de una misma entrega se serializan con un candado de aviso por entrega, porque la app no tiene
   `UPDATE` sobre el libro y `FOR UPDATE` lo exige.
5. **Traslado (D8).** Salida y entrada en una transacción, ligadas por `transfer_id`; origen distinto de destino y no más que
   el saldo del origen. **(revisión)** En el historial y en Inicio es **una sola entrada** («Traslado: origen → destino, N
   unidades») con un solo botón Anular; el libro sigue con dos filas y la API del historial devuelve la de la salida.
6. **Cantidades decimales por unidad (D4).** `numeric(14,3)`. En la API y el web viajan como texto y se calculan con
   milésimas en `bigint` (`@inventarius/shared`): ningún `number` toca una cantidad. Cada unidad admite entre 0 y 3
   decimales y se rechaza lo que no cabe. La unidad lleva además su nombre en plural para mostrar «1 par» y «12 pares».
7. **Bodega = ubicación de tipo bodega (D1)** y **categorías reutilizadas con ámbito (D11):** `categories.scope` es
   `asset` o `consumable`; no hay catálogo nuevo ni entidad de bodega.
8. **Permisos (D12).** Siete permisos `consumables:*`. **(revisión)** `consumables:adjust` (ajustes) y `consumables:reverse`
   (anular cualquier movimiento) son distintos: el Administrador tiene ambos, el Operador ajusta pero no anula (migración 0019,
   que conserva la anulación de quien ya tenía `adjust`). Las categorías de consumibles las administra `consumables:manage`; las
   de activos, `catalog:write`, y su nombre es único por ámbito (migración 0020). Matriz en `docs/open-questions.md` (Q57,
   Q60, Q61).
9. **Auditoría (D13).** Cada movimiento y cada cambio de catálogo va a `audit_log` con el actor; el historial de la ficha sale
   del libro (tiene lo que la auditoría no: vínculos de anulación y traslado) y la auditoría muestra los mismos hechos con
   textos traducidos. **(revisión)** La anulación audita el movimiento anulado completo (tipo, cantidad, bodega(s), receptor,
   nota, quién lo registró, fechas) y los saldos antes y después; el orden de lectura de los campos lo fija la web porque
   `jsonb` no conserva el de las claves.
10. **Fechas y bodegas inactivas (revisión).** Solo el ingreso admite una fecha distinta de hoy (hasta 90 días atrás, nunca
    futura); el historial muestra solo la fecha de un ingreso retroactivo y «Registrado el … por …». Una bodega inactiva con
    stock admite salidas (para vaciarla) y bloquea entradas, y los selectores la apagan con el motivo.

## Consecuencias

- Agregar un tipo de movimiento exige tocar los `CHECK` de la tabla, el servicio, el orden de campos y las traducciones del historial y de la auditoría (la devolución lo hizo).
- Un saldo que no cuadra con el libro es un error de la aplicación o una edición a mano: el comando lo detecta, no lo repara.
- El stock mínimo, la anulación y el historial no necesitan consultas especiales: salen del saldo y del libro.
- Fuera de alcance (backlog): importación CSV de ingresos, exportación de stock, costos y valorización, lotes y vencimientos,
  correos por stock mínimo y una prueba con lector de pantalla real.
