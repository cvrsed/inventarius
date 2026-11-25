# ADR 0009 — Cliente como entidad propia y alcance por subárbol

- Estado: Propuesto
- Fecha: 2026-11-25
- Requerimientos: RF-84, RF-87, RF-92 (sección 16 del requerimiento)

## Contexto

Hoy un cliente es solo un nombre en el árbol de ubicaciones (RF-12). v2 necesita datos propios (RUT, contactos), una
aplicación del LNS por cliente, órdenes de trabajo por cliente y una API cuyos tokens vean solo lo de un cliente. El árbol
ya existe, no tiene límite de profundidad y las consultas de subárbol terminan aunque haya ciclos
(`core/db/location-tree.ts`).

## Decisión

1. **Entidad `clients`** con `root_location_id` obligatorio y único (D1). Contactos en `client_contacts`; aplicaciones en
   `client_lns_applications`, únicas por (cliente, perfil LNS).
2. **La pertenencia se deriva, no se guarda.** Un activo es del cliente X si su **ubicación actual** está en el subárbol de
   la raíz de X. No hay `client_id` en activos ni en ubicaciones. En bodega fuera del subárbol o con una persona, no tiene
   cliente.
3. **Sin clientes anidados:** una raíz no puede estar dentro del subárbol de otro cliente ni contenerlo. Se valida al crear
   o cambiar la raíz y **al mover cualquier ubicación**, con un bloqueo que serialice los cambios del árbol.
4. **Una sola función de alcance** («ubicaciones del cliente X», sobre la CTE existente) que usan el listado, las órdenes de
   trabajo, la selección de aplicación y la API de integración. Nadie reimplementa la regla.
5. **El registro LNS guarda la aplicación usada** (`lns_registrations`), porque el mapeo del cliente y el destino del
   perfil pueden cambiar y la baja debe actuar donde se creó.

## Alternativas descartadas

- **Un tipo de ubicación «cliente»:** no admite RUT, contactos ni aplicaciones sin llenar `locations` de columnas que solo
  aplican a un tipo.
- **`client_id` en cada activo:** puede contradecir a la ubicación y obliga a mantenerlo en cada asignación y movimiento.
- **`client_id` copiado en cada ubicación:** acelera consultas, pero hay que reescribir subárboles enteros al mover.
- **Multiempresa (tenant) real:** aísla usuarios y catálogos, que no se pidió y cambia todo el modelo.

## Consecuencias

- Mover una ubicación puede cambiar de dueño a muchos equipos y cambiar lo que ve un token: exige confirmación y auditoría
  (Q93, Q126).
- El alcance es el **actual**: un token de cliente deja de ver un equipo al volver a bodega, y la historia de «qué fue de
  quién» solo está en la auditoría y las asignaciones.
- El filtro por cliente cuesta una consulta recursiva; hay que medirlo con el criterio de RNF-06. Si no alcanza, se
  materializa como caché derivada, sin cambiar la regla.
- El alcance por subárbol no es una barrera entre **usuarios** de Inventarius: los roles siguen siendo globales (sección 3).
  Dar cuentas a clientes exigiría otra decisión.
