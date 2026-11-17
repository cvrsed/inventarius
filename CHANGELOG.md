# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Desde v1.0.0 lo genera release-please
(sección 11.3); hasta entonces se mantiene a mano al cerrar cada fase.

## [Sin publicar]

### F2 — Inventario

#### Tercera tanda de revisión (PR #5)

- Inicio: «Activos por estado» con el nombre real de cada estado y el color de su tipo; sin jerga de tipos en la UI (el filtro dice
  «Estados asignables») [P20].
- Acciones y entidades de auditoría en español en Inicio, historial y auditoría, con un único mapa y un test de cobertura [P21].
- Filtros del listado: tres a la vista y el resto en «Más filtros» (se abre solo si hay alguno activo) [P22].
- Un solo camino para cambiar el estado: `POST /assets/:id/status` con nota e historial; la edición ya no tiene Estado [P23].
- IP real en la auditoría: solo se cree en `X-Forwarded-For` de `TRUSTED_PROXIES`; Caddy toma `CF-Connecting-IP` de su lista de
  confianza [P24].
- Detalle de auditoría legible (campo → valor, antes/después) [P25].
- Controles deshabilitados atenuados, nunca tachados [P26].

#### Segunda tanda de revisión (PR #5)

- Aviso de cambios sin guardar al navegar, recargar o cerrar un diálogo [P15].
- Alta en lote de activos (RF-27): 1 a 500 con series opcionales, estado semilla «Pendiente de configuración» (migración 0010),
  una transacción, historial por activo y un registro del lote [P16].
- Datos LoRaWAN opcionales al crear; obligatorios solo al registrar en el LNS (RF-21) [P17].
- Plan: importación CSV de datos LoRaWAN por serie pasa a Must en F3 (RF-66) y nueva fase F3.5 de consumibles (RF-70 a RF-74) [P18].
- Inicio con resumen (RF-28): totales por tipo de estado, categorías, stock por bodega, devoluciones atrasadas, últimos movimientos y
  «Mis equipos» para el técnico; corrige el «Aún no hay activos» con activos existentes. Nuevos filtros del listado: `statusKind`,
  `assigned`, `baseLocationId`, `overdue` [P19].

#### Revisión manual (PR #5)

- Catálogo: la pestaña activa refleja la ruta al entrar (`/catalogo` redirige a la primera sección); en móvil las
  secciones son un select.
- Modales con subtítulo por entidad y ayuda de «Activo» junto al switch (solo al editar); acciones de solo ícono con
  tooltip; «Eliminar» deshabilitado con el motivo cuando el registro está en uso (`withUsage`).
- Modelos: «Código del fabricante» con ejemplo; región, versión y parámetros regionales LoRaWAN como listas cerradas con
  búsqueda (fuente única en `packages/shared`); clase obligatoria; la API rechaza o descarta campos LoRaWAN si la
  categoría no es LoRaWAN.
- Fechas `dd-mm-aaaa HH:mm` (24 h) en la zona `APP_TIMEZONE`; costo de compra con moneda (`DEFAULT_CURRENCY`).
- Ubicaciones con tipo; activos con ubicación base y actual; asignar a persona deja la ubicación vacía («Con <persona>»),
  asignar a sitio excluye bodegas, devolver exige bodega (migración 0009; requirements.md actualizado).
- Historial de 10 en 10 con «Ver más»; menú de usuario con texto; barra inferior móvil con «Más»; tarjetas en móvil
  para catálogo, usuarios, roles y auditoría.
- Catálogo: categorías, fabricantes, modelos (con valores LoRaWAN por defecto), ubicaciones jerárquicas y estados con tipo;
  no se borra lo que está en uso, se desactiva (RF-10 a RF-14).
- Activos: alta con etiqueta autogenerable (`ASSET_TAG_PREFIX`), edición con `If-Match`, asignación a usuario o ubicación,
  devolución, baja lógica con motivo y restauración por administrador, historial con antes/después y exportación CSV
  (RF-20, RF-22 a RF-26). Búsqueda con `pg_trgm`; listado verificado con 10.000 activos (RNF-06).
- Permiso nuevo `asset:restore` (solo Administrador).
- UI: listados con paginación, orden y filtros del lado servidor reflejados en la URL, tarjetas bajo 768 px, ficha de
  activo con acciones al alcance (RF-40, RF-41) y app instalable con aviso sin conexión (RF-42).
- e2e de CRUD completo en escritorio y 360 px con axe en claro y oscuro (diálogos y selectores abiertos).
- CI: runners fijados a `ubuntu-24.04` (RNF-09). ADR 0005.

### F1 — Identidad
- Login con sesión en cookie `HttpOnly`/`SameSite=Strict`, CSRF de doble envío, rate limit, bloqueo progresivo por cuenta e IP,
  expiración inactiva y absoluta (RF-01, RF-05).
- CLI `create-admin` (RF-02); CRUD de usuarios, cambio y reseteo de contraseña con clave temporal (RF-03, RF-04).
- RBAC: 4 roles y 12 permisos sembrados, CRUD de roles con matriz editable y `If-Match`; todo endpoint declara su acceso.
- Auditoría append-only con diff y vista filtrable (RF-30, RF-31).
- UI de login, usuarios, roles y auditoría con navegación según permisos; e2e de identidad y `docs/security.md`.

### F0 — Fundaciones
- Monorepo pnpm con TypeScript estricto, ESLint, Prettier, commitlint y lefthook (RNF-09, RNF-11).
- API Fastify: configuración validada con Zod, logs JSON con censura de secretos, errores RFC 9457,
  `/api/health/live`, `/api/health/ready`, `/api/metrics`, `under-pressure` y OpenAPI fuera de producción (RNF-13).
- Drizzle con primera migración (`citext`) e instalación de pg-boss con usuario migrador; usuario de app solo DML.
- Frontend Vue + Nuxt UI v4 (tema propio por tokens; antes PrimeVue, ADR 0004) + Tailwind v4 + i18n es-CL, modo claro/oscuro y layout
  responsivo desde 360 px (RNF-01, RNF-03, RNF-05, RF-40).
- Vitest (shared, api, web), integración con Postgres 18 real (Testcontainers) y Playwright + axe en Docker.
- `compose.yml` de desarrollo, `compose.e2e.yml`, Dockerfile multi-etapa con imágenes por digest.
- CI en GitHub Actions y Renovate.
- ADRs 0001 (monolito modular) y 0002 (stack y versiones).
