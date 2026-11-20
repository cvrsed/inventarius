# ADR 0008 — Consumibles por cantidad (F3.5)

- Estado: aceptada
- Fecha: 2026-11-20

## Contexto

F3.5 agrega consumibles que se cuentan por cantidad (EPP, repuestos): catálogo, ingreso a bodega, entrega a una persona,
stock por bodega y stock mínimo (RF-70 a RF-74). A diferencia de un activo, un consumible no tiene identidad por unidad:
lo que importa es cuánto hay en cada bodega y cómo llegó a ese número.

## Decisiones

1. **El libro de movimientos es la fuente de verdad (D2).** `consumable_movements` es append-only: la app no tiene
   `UPDATE` ni `DELETE` sobre ella (el migrador los revoca, igual que en `audit_log`). Cada fila lleva un `delta` con signo
   respecto de una bodega; el saldo de una bodega es la suma de sus `delta`. Tipos: `receipt`, `delivery`, `adjustment`,
   `transfer_out`, `transfer_in` y `reversal`. Los `CHECK` de la tabla fijan el signo de cada tipo, el receptor de una entrega
   (usuario **o** nombre), el motivo de un ajuste y que una anulación lleve motivo.
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
   bodegas, desde cualquiera de sus lados, en una transacción; si algún saldo quedara negativo se rechaza entero.
5. **Traslado (D8).** Salida y entrada en una transacción, ligadas por `transfer_id`; origen distinto de destino y no más que
   el saldo del origen.
6. **Cantidades decimales por unidad (D4).** `numeric(14,3)`. En la API y el web viajan como texto y se calculan con
   milésimas en `bigint` (`@inventarius/shared`): ningún `number` toca una cantidad. Cada unidad admite entre 0 y 3
   decimales y se rechaza lo que no cabe. La unidad lleva además su nombre en plural para mostrar «1 par» y «12 pares».
7. **Bodega = ubicación de tipo bodega (D1)** y **categorías reutilizadas con ámbito (D11):** `categories.scope` es
   `asset` o `consumable`; no hay catálogo nuevo ni entidad de bodega.
8. **Permisos (D12).** Seis permisos `consumables:*`. Ajustar y anular (`consumables:adjust`) es solo del Administrador por
   defecto, porque corrige el stock sin que entre ni salga nada. Matriz en `docs/open-questions.md` (Q61); qué otros roles
   deberían tenerlo queda abierto para el responsable (Q60).
9. **Auditoría (D13).** Cada movimiento y cada cambio de catálogo va a `audit_log` con el actor; el historial de la ficha sale
   del libro (tiene lo que la auditoría no: vínculos de anulación y traslado) y la auditoría muestra los mismos hechos con
   textos traducidos.

## Consecuencias

- Agregar un tipo de movimiento exige tocar el `CHECK` de signo, el servicio y las traducciones del historial y de la auditoría.
- Un saldo que no cuadra con el libro es un error de la aplicación o una edición a mano: el comando lo detecta, no lo repara.
- El stock mínimo, la anulación y el historial no necesitan consultas especiales: salen del saldo y del libro.
- Fuera de alcance (backlog): importación CSV de ingresos, exportación de stock, devoluciones como tipo propio, costos y
  valorización, lotes y vencimientos, correos por stock mínimo.
