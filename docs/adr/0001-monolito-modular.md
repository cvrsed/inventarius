# ADR 0001 — Monolito modular

- Estado: aceptada
- Fecha: 2026-11-16

## Contexto

Inventarius es una aplicación de inventario con una integración externa (LNS LoRaWAN) y trabajo en segundo plano.
El equipo es pequeño, el despliegue inicial es una sola VM y debe poder migrarse a otra infraestructura
cambiando solo configuración (RNF-08).

## Decisión

Un **monolito modular**:

- Una API (Fastify) con módulos de dominio aislados: `auth`, `users`, `rbac`, `audit`, `catalog`, `assets`,
  `lorawan`, `lns`. Hoy solo existe `health`; el resto llega por fase.
- Un **worker** que comparte el código y consume la cola (pg-boss sobre el mismo Postgres). Es otro entrypoint
  (`worker.ts`), no otro servicio con código propio.
- Un frontend SPA (Vue) servido en el **mismo origen** que la API (`/` y `/api`), por Caddy.
- Un solo despliegue (Docker Compose) y una sola base de datos.

Reglas de módulos:

1. Cada módulo expone un plugin Fastify (rutas) y un servicio público.
2. Capas internas: `routes` (HTTP) → `service` (reglas de negocio) → `repository` (SQL). Sin lógica de negocio
   en rutas ni en componentes Vue.
3. Ningún módulo lee las tablas de otro directamente: lo hace por el servicio público del dueño.
4. Los adaptadores externos (LNS, cifrado, reloj) se inyectan, para poder testearlos con dobles.
5. Errores tipados del dominio, mapeados a HTTP en un solo lugar (`core/errors.ts` + `app.ts`).
6. `process.env` solo se lee en `core/config`, validado con Zod al arrancar.

## Motivos

- Menos piezas que operar: un despliegue, una BD, sin Redis ni broker (RNF-07, RNF-08).
- Los límites de módulo mantienen abierta la opción de separar un servicio el día que haga falta.
- Mismo origen: cookies de sesión sin CORS ni tokens en el navegador (sección 10).

## Costos aceptados

- Un módulo defectuoso puede afectar al proceso completo (mitigado con `under-pressure` y reinicio automático).
- La disciplina de límites entre módulos se sostiene por convención y revisión; no hay frontera de proceso.

## Alternativas descartadas

- **Microservicios**: sobreingeniería para el alcance del MVP.
- **Cola externa (Redis/RabbitMQ)**: un servicio más sin necesidad con el volumen esperado; pg-boss cubre reintentos y backoff.

## Reversibilidad

Alta mientras se respeten las reglas de módulos: extraer un módulo es mover su plugin y su servicio a otro proceso.
