# Progreso

## Estado

| Fase           | Estado      | Rama / PR              |
| -------------- | ----------- | ---------------------- |
| F0 Fundaciones | En curso    | `phase/f0-fundaciones` |
| F1 Identidad   | Pendiente   | —                      |
| F2 Inventario  | En revisión | `phase/f2-inventario`  |
| F3 LoRaWAN     | Pendiente   | —                      |
| F4 Cierre      | Pendiente   | —                      |

## Bitácora

- 2026-11-16: repositorio inicializado con requerimiento, CLAUDE.md, ADR 0003 y configuración de Claude Code.

## F0 — Fundaciones (rama `phase/f0-fundaciones`)

**Hecho**

- [x] Monorepo pnpm (workspaces, versiones exactas, Node/pnpm fijados), TS estricto, ESLint + Prettier, commitlint, lefthook
- [x] ADR 0001 (monolito modular) y 0002 (stack y versiones reales)
- [x] `packages/shared` con Zod (health, problem+json)
- [x] API: config validada, logger con censura, errores tipados -> RFC 9457, health live/ready, métricas, under-pressure, OpenAPI
- [x] Drizzle + migración inicial (`citext`), pg-boss instalado por el migrador, roles migrador/app
- [x] Worker (entrypoint pg-boss mínimo, sin handlers hasta F3)
- [x] Web: Vue + PrimeVue styled con preset propio (reemplazado por Nuxt UI v4, ver «Cambio de librería de UI») + Tailwind v4 + i18n es-CL + layout responsivo + modo oscuro
- [x] Vitest (shared 3, api 37 + 8 de integración con Postgres 18 real, web 15), cobertura sobre umbrales
- [x] Playwright + axe en Docker (imagen oficial 1.65.1): 18 tests en escritorio y móvil (360 px), claro y oscuro
- [x] `compose.yml` (dev), `compose.e2e.yml`, Dockerfile multi-etapa, `.env.example`
- [x] CI de GitHub Actions y Renovate (escritos; ver pendiente)
- [x] README, CHANGELOG, `docs/development.md`

**Pendiente / no verificado**

- El workflow de CI **no se ha ejecutado** en GitHub todavía: su primer run real ocurre al abrir el PR. Los jobs `security` (audit/OSV/gitleaks) e `images` (Trivy) no se pudieron probar localmente.
- Ver `docs/open-questions.md` (Q2 PrimeVue 5, Q3 TypeScript 7, Q4 Swagger UI, Q5 cliente generado, Q7 CSP, Q9 primeicons).

**Decisiones**: Node 26.13.1 (D1), PrimeVue 4.5.5, TypeScript 6.0.3, `shared` con exports condicionales (`inventarius-source`/`default`).

**Cómo probarlo**: ver `docs/development.md`. `pnpm install && docker compose up --build` → http://localhost:5173 y `/api/health/ready`.
`pnpm lint && pnpm typecheck && pnpm test`; `pnpm test:coverage`; e2e con `compose.e2e.yml` (el script del paquete es `test:e2e`, fuera de `pnpm test`).

**Aprendizajes**: `up --exit-code-from` aborta con servicios one-shot; `npm i -g pnpm --ignore-scripts` deja un `pnpm` no ejecutable por `exec`; axe detectó contraste insuficiente en los mensajes de Aura (corregido en el preset).

## F1 — Identidad (rama `phase/f1-identidad`, apilada sobre `phase/f0-fundaciones`)

**Hecho**

- [x] RF-01 login con cookie de sesión (`HttpOnly`, `SameSite=Strict`, `__Host-` con HTTPS), logout, expiración inactiva y absoluta
- [x] RF-02 CLI `create-admin` (contraseña por env o sin eco; `--if-missing`)
- [x] RF-03 CRUD de usuarios, activar/desactivar (invalida sesiones), regla de al menos un administrador activo
- [x] RF-04 cambio de contraseña propio y reseteo por administrador (temporal de un uso, cambio obligatorio)
- [x] RF-05 bloqueo progresivo por cuenta y por IP + rate limit en login
- [x] Roles y permisos sembrados (4 roles, 12 permisos), CRUD de roles con matriz editable, `If-Match`/ETag en PATCH
- [x] Decorador declarativo de acceso: toda ruta de `/api/v1` debe declararlo o la app no arranca
- [x] CSRF de doble envío, hash del token de sesión en BD, rotación en cada login
- [x] RF-30/RF-31 auditoría append-only (privilegios de BD) con diff y vista filtrable
- [x] UI: login, cambio de contraseña, usuarios, roles, auditoría; guards por permiso; menú filtrado
- [x] Ajustes tras la revisión de Rodrigo (ver «Ajustes de revisión» abajo)
- [x] Tests: 117 api (45 de integración con Postgres 18), 56 web, 16 shared; 40 e2e (escritorio y 360 px, axe claro/oscuro)
- [x] Criterios de aceptación: permisos por rol en **todas** las rutas (test que recorre `routeAccess` contra los 4 roles y anónimo),
      test que detecta rutas sin permiso (`assertRouteDeclaresAccess`), login/bloqueo/expiración en e2e

**Pendiente / no verificado**

- La lista de contraseñas comunes sigue siendo mínima (~60 entradas): issue #4, por decisión de Rodrigo no se cambia aún (Q12).

**Cómo probarlo**: `docs/development.md` (incluye `create-admin`). `pnpm lint && pnpm typecheck && pnpm test:coverage`;
`pnpm --filter @inventarius/api test:int`; e2e con `compose.e2e.yml`. Controles en `docs/security.md`.

## Ajustes de revisión (PR #2, 2026-11-16)

Un commit por punto, todo en `phase/f1-identidad`:

1. **PrimeVue 5**: 5.0.5 es estable (`latest`), pero cambió de licencia (clave obligatoria, pago según tamaño de la
   organización). No se migró a la 5; Rodrigo decidió después reemplazar PrimeVue por Nuxt UI v4 (ver abajo).
2. **TypeScript 6.0.x**: justificación en `docs/adr/0002-stack.md` (TS 7 sin API programática hasta 7.1).
3. **Sesión absoluta 24 h** (antes 7 d), con tests de integración con la configuración por defecto.
4. **Correo**: solo un administrador lo edita y nunca el propio; invalida sesiones y audita antes/después. Tests API y UI.
5. **Excepciones de vulnerabilidades** detalladas en `docs/security.md`; issue #3 (Caddy, revisión 2026-12-16).
6. **primeicons** aceptado: en la sección 7.2 del requerimiento y en el ADR 0002 (retirado después con PrimeVue).
7. **Job de pg-boss** que purga sesiones vencidas (absolutas o inactivas) cada hora; el migrador crea la cola. Tests de integración.
8. **MultiSelect** con el panel abierto pasa axe; e2e con el panel abierto (ahora sobre el selector de Nuxt UI).
9. **Lista de contraseñas comunes**: sin cambios; issue #4.
10. `docs/requirements.md` actualizado (RF-01, RF-03, 7.2).

## Cambio de librería de UI y CLI de correo (PR #2, 2026-11-16)

Segunda tanda de ajustes de Rodrigo, un commit por punto en `phase/f1-identidad`:

1. **PrimeVue → Nuxt UI v4 (MIT)**, modo Vue + Vite sin Nuxt. Se eliminaron `primevue`, `@primeuix/*`, `primeicons` y
   `tailwindcss-primeui` (ninguna dependencia de PrimeTek en `package.json` ni en el lockfile). Versión exacta 4.12.0
   (4.12.1/4.12.2 son del mismo día y quedan bajo la política de antigüedad mínima de pnpm).
   - Tema por design tokens en `apps/web/src/theme/` (`theme.ts`, `theme.css`): paleta teal/zinc, radios, tipografía, contraste AA, oscuro.
   - Migradas: layout, login, cambio de contraseña, usuarios, roles (diálogos y confirmaciones), auditoría (filas expandibles,
     filtros y paginación del lado servidor), inicio y estado, 403/404.
   - Íconos Lucide empaquetados; Iconify sin proveedores; un e2e verifica que ninguna petición sale del origen.
   - Locale `es` de Nuxt UI más vue-i18n es-CL. Pruebas: 64 web, 126 api, 16 shared y 42 e2e (escritorio y 360 px) con axe
     en claro y oscuro, incluidos diálogo de confirmación, selector de roles y select de página ABIERTOS.
2. **ADR 0004** «UI con Nuxt UI v4»; el 0003 queda «Reemplazado por 0004».
3. **CLAUDE.md, requerimiento (RNF-01, 7.2, 7.3, estructura, riesgos) y ADR 0002** actualizados.
4. **`cli update-email`**: cambia el correo de cualquier usuario, también del único administrador; valida, exige unicidad,
   cierra sesiones y audita con antes/después y actor `cli` (nueva columna `audit_log.actor_label`, migración 0004).
   Documentado en `docs/operations.md`. Probado también contra el stack e2e real.
5. **Q2 cerrada**; Q9 y Q21 cerradas.

**Decisiones técnicas a revisar** (en el ADR 0004): `exactOptionalPropertyTypes` desactivado solo en `apps/web`;
condición de exports renombrada a `inventarius-source`; selects de página con `inert` en el fondo (`AppSelect`).

## Resumen de la sesión (2026-11-16)

- **PRs abiertos**: #1 `phase/f0-fundaciones` → `main`; #2 `phase/f1-identidad` → `phase/f0-fundaciones` (apilado).
- **CI**: ambos PR terminan con todos los jobs en verde (lint/typecheck, unitarios en Node 26 y 24, integración con cobertura, e2e
  Playwright + axe en Docker, auditoría + OSV + gitleaks, build de imágenes y Trivy). Para llegar ahí hubo que corregir en CI cosas
  que localmente no se veían: `pnpm test` ejecutaba el paquete e2e; zlib desactualizada en la imagen api y `npm` vendorizado
  (con CVEs) que se quitó del runtime; CVE de `x/net` en Caddy sin imagen corregida (`.trivyignore`, Q22); gitleaks 8.24 con
  falsos positivos en contraseñas ficticias de tests (allowlist por ruta); axe leyendo colores a mitad de una transición.
- **Decisiones provisionales que requieren revisión de Rodrigo** (detalle en `docs/open-questions.md`): UI con Nuxt UI en vez de PrimeVue (Q2, decidida por Rodrigo),
  TypeScript 6 en vez de 7 (Q3), vulnerabilidades ignoradas (Q11, Q22),
  sesión absoluta de 24 h (Q15, decidida por Rodrigo), umbrales de bloqueo (Q16), roles semilla no borrables ni renombrables (Q13), correo editable solo por un administrador que no sea el propio usuario (Q18, decidida por Rodrigo).
- **Bugs reales que encontraron las pruebas** (corregidos): `--ignore-scripts` dejaba un `pnpm` no ejecutable; `up --exit-code-from`
  abortaba con servicios de un solo uso; contraste AA en mensajes de Aura; `aria-expanded` inválido en el input de contraseña de PrimeVue;
  claves i18n con punto que no resolvían; ruta `/api/metrics` visible tras Caddy.
- **Pendiente de Rodrigo**: issues #3 (Caddy, 2026-12-16) y #4 (lista de contraseñas).
- **Siguiente paso sugerido**: revisar y mergear #1, luego #2 (cambiar su base a `main`); empezar F2 (Inventario) solo con instrucción explícita.

## F2 — Inventario (rama `phase/f2-inventario`, desde `main`)

**Hecho**

- [x] Catálogo RF-10 a RF-14: categorías, fabricantes, modelos (defaults LoRaWAN solo en categorías `lorawan`), ubicaciones
      jerárquicas (ruta completa, sin ciclos) y estados con tipo; versión optimista (`If-Match`), auditoría, y «no se borra lo
      que está en uso, se desactiva».
- [x] Activos RF-20, RF-22 a RF-26: alta con etiqueta autogenerable (`ASSET_TAG_PREFIX`), edición, asignación a usuario o
      ubicación y devolución, baja lógica con motivo, restauración por administrador (`asset:restore`), historial con
      antes/después y exportación CSV. RF-21 (sección LoRaWAN) y los filtros «estado LNS»/DevEUI son de F3 (Q25).
- [x] Vistas móviles RF-40 a RF-42: tarjetas bajo 768 px, ficha con las acciones principales en la primera pantalla, manifest,
      íconos y aviso sin conexión.
- [x] UI: listados con `UTable`, paginación, orden y filtros del lado servidor, reflejados en la URL; selectores con búsqueda
      en el servidor; formularios y diálogos en es-CL.
- [x] Runners de GitHub Actions fijados a `ubuntu-24.04` (RNF-09).
- [x] ADR 0005, CHANGELOG, `docs/development.md` y Q23 a Q35 en `docs/open-questions.md`.

**Criterio de rendimiento (RNF-06): 10.000 activos**

Medición reproducible: `apps/api/src/modules/assets/assets.perf.int.test.ts` (Postgres 18 en contenedor, siembra por SQL,
60 muestras por caso a través de Fastify con `inject`, sesión de Lector). Presupuesto: p95 < 300 ms.

| caso                          | p50 (ms) | p95 (ms) | máx (ms) |
| ----------------------------- | -------- | -------- | -------- |
| página 1, orden por etiqueta  | 59,9     | 63,7     | 66,1     |
| página 1 con 100 filas        | 60,3     | 64,8     | 72,7     |
| página profunda (400)         | 65,9     | 71,0     | 79,2     |
| búsqueda por texto            | 41,2     | 44,0     | 53,0     |
| búsqueda por serie            | 52,3     | 56,7     | 61,8     |
| filtro por estado y ubicación | 12,8     | 15,2     | 17,8     |
| orden por nombre descendente  | 59,8     | 67,0     | 75,6     |
| orden por modelo con filtro   | 25,2     | 27,1     | 48,7     |

El peor p95 es ~71 ms, unas 4 veces por debajo del objetivo. La medición excluye red y Caddy (Q33). Bundle inicial del
frontend en el build de e2e: `index` 93,6 KB gzip + CSS 27,4 KB (objetivo < 250 KB gzip), rutas con carga diferida.

**Pruebas**

- API: **API_UNIT** unitarias; **API_INT** de integración con Postgres 18 (catálogo, activos, permisos por rol en todas las rutas
  —incluidas las nuevas—, concurrencia de asignaciones, rendimiento).
- Shared: 26. Web: **WEB** (listados, ficha por permisos, formularios, historial, estado en la URL, aviso sin conexión).
- e2e (Playwright + axe, escritorio 1280 px y móvil 360 px): **E2E**.

**Decisiones provisionales** (detalle en `docs/open-questions.md`, Q23 a Q35): permiso `asset:restore`; filtros planos en la
query; estados semilla y «Asignado» de sistema; no se cambia estado ni se da de baja un activo asignado; CSV con BOM;
sin service worker; historial desde auditoría (ADR 0005).

**Errores reales que encontraron las pruebas** (corregidos, cada uno con su test):

- El refresco de la sesión era fijo de 30 s: con una inactividad menor (15 s en e2e) la sesión moría aunque el usuario trabajara.
  Ahora el refresco es como mucho una cuarta parte de la inactividad (`session-touch.int.test.ts`).
- El formulario de activo ignoraba lo escrito en los campos de texto (el manejador devolvía una función en vez de ejecutarla).
- El alta de activo pedía `GET /assets/` sin id; el 400 y sus reintentos retrasaban ~7 s el aviso de éxito.
- Un enlace con `page=2` volvía a la página 1 (el paginador emitía la página 1 con total 0 y la búsqueda reescribía la URL al
  volver atrás); además un temporizador de búsqueda seguía vivo tras desmontar la página.
- Tarjetas del listado con `aria-label` que no contenía su texto visible (axe `label-content-name-mismatch`).
- Las fechas de consultas SQL crudas llegaban como texto desde el driver (ubicaciones).

**Cómo probarlo**

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test            # unitarios (shared, api, web)
pnpm --filter @inventarius/api test:int             # integración con Postgres 18 (Docker)
pnpm --filter @inventarius/api exec vitest run --project int assets.perf --disableConsoleIntercept   # RNF-06
docker compose -f compose.e2e.yml up -d --build --wait web worker
docker compose -f compose.e2e.yml run --rm --build e2e
docker compose -f compose.e2e.yml down --volumes
```

A mano: `docker compose up --build`, crea el administrador (`docs/development.md`), entra a http://localhost:5173 y recorre
Catálogo → Activos → Nuevo activo → Asignar/Devolver → Dar de baja/Restaurar; prueba también a 360 px y con el modo oscuro.

**Pendiente / no verificado**

- Instalar la app en un celular real (Q31) y repetir la medición de rendimiento contra el despliegue real (Q33).
- Agregar `ASSET_TAG_PREFIX=INV` a `.env.example` (Q32).

## Resumen de la sesión F2 (2026-11-16)

- **Rama y PR**: `phase/f2-inventario` desde `main` → PR hacia `main`. No se empezó F3.
- **Alcance entregado**: catálogo (RF-10 a RF-14), activos con historial (RF-20, RF-22 a RF-26), vistas móviles (RF-40 a RF-42),
  rendimiento con 10.000 activos (peor p95 ≈ 71 ms frente a 300 ms), e2e de CRUD completo en escritorio y 360 px con axe en claro
  y oscuro, y runners fijados a `ubuntu-24.04`. RF-21 y los filtros de LNS quedan para F3 (Q25).
- **Decisiones provisionales que requieren revisión de Rodrigo** (detalle en `docs/open-questions.md`): permiso nuevo
  `asset:restore` (Q23), filtros planos en la query en vez de `filter[campo]` (Q24), estados semilla y «Asignado» de sistema
  (Q26), no cambiar estado ni dar de baja un activo asignado (Q27), formato del CSV (Q30), sin service worker (Q31).
- **Pendiente de Rodrigo**: agregar `ASSET_TAG_PREFIX=INV` a `.env.example` (la sesión no puede leer ni editar ese archivo, Q32);
  instalar la app en un celular real (Q31); repetir la medición de rendimiento contra el despliegue real (Q33).
- **CI**: el PR #5 termina con todos los jobs en verde (lint/typecheck, unitarios en Node 26 y 24, integración con cobertura, e2e
  Playwright + axe en Docker, auditoría + OSV + gitleaks, build de imágenes y Trivy). Dos cosas que solo se vieron en CI y se
  corrigieron: el umbral de cobertura (80 %) del paquete compartido con los esquemas nuevos, y un selector de e2e que dependía
  de que el panel anterior ya estuviera cerrado (se verificó con tres repeticiones del spec).
- **Siguiente paso sugerido**: revisar y mergear el PR de F2; empezar F3 (LoRaWAN) solo con instrucción explícita.

## Revisión manual de F2 (2026-11-17, mismo PR #5)

Los 14 puntos de la revisión de Rodrigo, un commit por punto sobre `phase/f2-inventario`:

1. Pestaña activa del catálogo según la ruta (`/catalogo` redirige a `categories`); e2e entrando directo a cada ruta.
2. Subtítulo del modal por entidad; ayuda de «Activo» junto al switch solo al editar.
3. `IconAction` (tooltip con texto) en todas las acciones de solo ícono; «Eliminar» deshabilitado con el motivo (`withUsage`).
4. «Código del fabricante» con ayuda «Ej.: SDM530-LR-AU915».
5. Listas LoRaWAN en `packages/shared` (13 regiones, versiones, parámetros regionales, clases) con selects con búsqueda en
   español; nueva columna `lorawan_region` (migración 0007).
6. La API rechaza campos LoRaWAN si la categoría no lo es (y los descarta al cambiar de categoría); clase obligatoria.
7. Fechas `dd-mm-aaaa HH:mm` en `APP_TIMEZONE` vía `GET /api/v1/settings`.
8. Costo con moneda (`DEFAULT_CURRENCY`, CLP; migración 0008).
9. Tipo de ubicación, ubicación base y devolución a bodega (migración 0009); `docs/requirements.md` actualizado (RF-12, RF-20, RF-23).
10. Historial de 10 en 10 con «Ver más» (infinite query sobre la paginación de la API).
11. Barra inferior móvil: Inicio, Activos, Catálogo y Más (panel con Usuarios, Roles, Auditoría, contraseña, tema y salir), por permisos.
12. Menú de usuario en la cabecera con opciones con texto.
13. Select de sección del catálogo en móvil.
14. `ResponsiveTable`: tarjetas con acciones visibles en móvil para catálogo, usuarios, roles y auditoría.

- **Decisiones provisionales nuevas**: Q36 a Q40 en `docs/open-questions.md` (moneda por activo, migración de datos de F2,
  destinos de asignación, valores de las listas LoRaWAN, `modelNumber` solo cambia de rótulo).
- **Nota**: `compose.yml` ahora pasa `DEFAULT_CURRENCY` y `ASSET_TAG_PREFIX`; `.env.example` sigue sin poder editarse desde la sesión.
- **Cómo probar**: `pnpm lint && pnpm typecheck && pnpm test`, `pnpm --filter @inventarius/api exec vitest run --project int`
  y el e2e de `docs/development.md` (escritorio y 360 px).

## Segunda tanda de revisión de F2 (2026-11-17, mismo PR #5)

Marcas `[P15]` a `[P19]` al final del asunto de cada commit.

- **P15** Aviso de cambios sin guardar (`useUnsavedChanges`: guardián del router, `beforeunload` y cierre de diálogos) en el formulario
  de activo, el alta en lote y los diálogos de catálogo, usuarios y roles. e2e incluido.
- **P16** Alta en lote (RF-27 en `docs/requirements.md`): `POST /api/v1/assets/batch`, pantalla `/activos/lote` accesible desde «Nuevo
  activo» y usable en 360 px, estado semilla «Pendiente de configuración» (migración 0010). Series duplicadas o ya existentes se rechazan.
- **P17** `requirements.md`: los datos LoRaWAN son opcionales al crear y obligatorios solo al registrar en el LNS (lo valida F3).
- **P18** `requirements.md`: la importación CSV por serie pasa a Must en F3 (RF-66); nueva fase F3.5 «Consumibles» (RF-70 a RF-74) con su
  fila en el plan y su criterio de aceptación.
- **P19** Inicio (RF-28): `GET /api/v1/dashboard` con conteos agregados en SQL, filtros nuevos del listado (`statusKind`, `assigned`,
  `baseLocationId`, `overdue`), tarjetas y barras con CSS que enlazan al listado filtrado, vista de técnico y estado del sistema
  compacto para administradores. Corrige el «Aún no hay activos» con activos existentes (test).
- **Decisiones provisionales nuevas**: Q41 a Q46 en `docs/open-questions.md`.
- **Cómo probar**: `pnpm lint && pnpm typecheck && pnpm test`, integración de la API y el e2e de `docs/development.md` (escritorio y 360 px).

## Tercera tanda de revisión de F2 (2026-11-17, mismo PR #5)

Marcas `[P20]` a `[P26]` al final del asunto de cada commit.

- **P20** Sin jerga de tipos de estado: «Activos por estado» muestra cada estado con su nombre y el color de su tipo (`byStatus` en el
  resumen; los totales siguen calculándose por tipo). Los tipos se llaman «Asignable» / «No asignable» y, en el filtro del listado,
  «Estados asignables», «Estados pendientes», etc.
- **P21** Un solo mapa de textos (`app/i18n/audit.ts`) para acciones y entidades en Inicio, historial y auditoría. La lista de acciones y
  entidades vive en `packages/shared` y el API solo puede registrar esas (error de compilación si no), con un test que falla si falta una
  traducción. «Alta», «Alta en lote», «Edición», «Cambio de estado», «Asignación», «Devolución», «Baja», «Restauración»; `asset_batch` → «Activos».
- **P22** Filtros del listado: Estado, Categoría y Ubicación base a la vista; el resto tras «Más filtros», que se abre solo si alguno de ellos
  está activo (p. ej. al llegar desde el Inicio).
- **P23** Un solo camino para cambiar el estado: el formulario de edición ya no tiene Estado y `PATCH` rechaza `statusId` (400). «Cambiar
  estado» usa `POST /api/v1/assets/:id/status` (nota opcional, acción `asset.status_change`, visible en el historial).
- **P24** IP real en la auditoría: `trustProxy` pasa de `true` a la lista `TRUSTED_PROXIES`; Caddy acepta `CF-Connecting-IP` solo de
  `TRUSTED_PROXY_RANGES`; el proxy de Vite informa `X-Forwarded-For`. Test con `X-Forwarded-For` falso desde un origen no confiable.
  Documentado en `docs/security.md` y `docs/operations.md`.
- **P25** Detalle de auditoría como lista campo → valor en español, con antes/después solo de lo que cambió (en lugar de JSON).
- **P26** Controles deshabilitados atenuados y nunca tachados: regla global, test que impide texto tachado y e2e sobre «Limpiar filtros».
- **Decisiones provisionales nuevas**: Q47 a Q50 en `docs/open-questions.md`.
- **Verificación**: lint, typecheck, 250 pruebas web, 103 unitarias y 165 de integración del API, e2e completo en escritorio y 360 px.
  En una corrida el axe de «alta por la UI» falló una vez por el `aria-hidden` del enlace de salto con un select abierto (el patrón
  ya conocido de `useInertWhileOpen`) y pasó al reintentar y en 6 repeticiones.
