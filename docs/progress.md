# Progreso

## Estado

| Fase             | Estado      | Rama / PR                |
| ---------------- | ----------- | ------------------------ |
| F0 Fundaciones   | En curso    | `phase/f0-fundaciones`   |
| F1 Identidad     | Pendiente   | —                        |
| F2 Inventario    | En revisión | `phase/f2-inventario`    |
| F3 LoRaWAN       | En curso    | `phase/f3-lorawan`       |
| F3.5 Consumibles | En revisión | `phase/f3.5-consumibles` |
| F4 Cierre        | Pendiente   | —                        |

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
- [x] Ajustes tras la revisión del responsable del proyecto (ver «Ajustes de revisión» abajo)
- [x] Tests: 117 api (45 de integración con Postgres 18), 56 web, 16 shared; 40 e2e (escritorio y 360 px, axe claro/oscuro)
- [x] Criterios de aceptación: permisos por rol en **todas** las rutas (test que recorre `routeAccess` contra los 4 roles y anónimo),
      test que detecta rutas sin permiso (`assertRouteDeclaresAccess`), login/bloqueo/expiración en e2e

**Pendiente / no verificado**

- La lista de contraseñas comunes sigue siendo mínima (~60 entradas): issue #4, por decisión del responsable del proyecto no se cambia aún (Q12).

**Cómo probarlo**: `docs/development.md` (incluye `create-admin`). `pnpm lint && pnpm typecheck && pnpm test:coverage`;
`pnpm --filter @inventarius/api test:int`; e2e con `compose.e2e.yml`. Controles en `docs/security.md`.

## Ajustes de revisión (PR #2, 2026-11-16)

Un commit por punto, todo en `phase/f1-identidad`:

1. **PrimeVue 5**: 5.0.5 es estable (`latest`), pero cambió de licencia (clave obligatoria, pago según tamaño de la
   organización). No se migró a la 5; el responsable del proyecto decidió después reemplazar PrimeVue por Nuxt UI v4 (ver abajo).
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

Segunda tanda de ajustes del responsable del proyecto, un commit por punto en `phase/f1-identidad`:

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
- **Decisiones provisionales que requieren revisión del responsable del proyecto** (detalle en `docs/open-questions.md`): UI con Nuxt UI en vez de PrimeVue (Q2, decidida por el responsable del proyecto),
  TypeScript 6 en vez de 7 (Q3), vulnerabilidades ignoradas (Q11, Q22),
  sesión absoluta de 24 h (Q15, decidida por el responsable del proyecto), umbrales de bloqueo (Q16), roles semilla no borrables ni renombrables (Q13), correo editable solo por un administrador que no sea el propio usuario (Q18, decidida por el responsable del proyecto).
- **Bugs reales que encontraron las pruebas** (corregidos): `--ignore-scripts` dejaba un `pnpm` no ejecutable; `up --exit-code-from`
  abortaba con servicios de un solo uso; contraste AA en mensajes de Aura; `aria-expanded` inválido en el input de contraseña de PrimeVue;
  claves i18n con punto que no resolvían; ruta `/api/metrics` visible tras Caddy.
- **Pendiente del responsable del proyecto**: issues #3 (Caddy, 2026-12-16) y #4 (lista de contraseñas).
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
- **Decisiones provisionales que requieren revisión del responsable del proyecto** (detalle en `docs/open-questions.md`): permiso nuevo
  `asset:restore` (Q23), filtros planos en la query en vez de `filter[campo]` (Q24), estados semilla y «Asignado» de sistema
  (Q26), no cambiar estado ni dar de baja un activo asignado (Q27), formato del CSV (Q30), sin service worker (Q31).
- **Pendiente del responsable del proyecto**: agregar `ASSET_TAG_PREFIX=INV` a `.env.example` (la sesión no puede leer ni editar ese archivo, Q32);
  instalar la app en un celular real (Q31); repetir la medición de rendimiento contra el despliegue real (Q33).
- **CI**: el PR #5 termina con todos los jobs en verde (lint/typecheck, unitarios en Node 26 y 24, integración con cobertura, e2e
  Playwright + axe en Docker, auditoría + OSV + gitleaks, build de imágenes y Trivy). Dos cosas que solo se vieron en CI y se
  corrigieron: el umbral de cobertura (80 %) del paquete compartido con los esquemas nuevos, y un selector de e2e que dependía
  de que el panel anterior ya estuviera cerrado (se verificó con tres repeticiones del spec).
- **Siguiente paso sugerido**: revisar y mergear el PR de F2; empezar F3 (LoRaWAN) solo con instrucción explícita.

## Revisión manual de F2 (2026-11-17, mismo PR #5)

Los 14 puntos de la revisión del responsable del proyecto, un commit por punto sobre `phase/f2-inventario`:

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

## Sexta tanda de revisión de F2 (2026-11-18, mismo PR #5)

Marcas `[P42]` a `[P44]` al final del asunto de cada commit.

- **P42** Menús de filtro: el panel mide entre 280 y 400 px (no hereda el ancho del botón), se alinea al botón sin salirse de la pantalla y los
  textos largos pasan a 2 líneas (nunca «…»). Las ubicaciones se muestran en dos líneas (nombre arriba, ruta de padres abajo con «›»), también en los
  selects de formularios; la búsqueda encuentra por nombre y por ruta (la API ya buscaba en la ruta). El buscador interno dice qué busca
  («Buscar ubicación…», «Buscar categoría…», «Buscar estado…»). El chip muestra solo el nombre. e2e con nombres largos en escritorio y 360 px, con axe.
- **P43** «Antes → después» solo para campos que cambiaron de valor; los datos propios del evento (motivo, nota, a quién se asignó, devolución) y el
  contexto se ven como valor simple, en el detalle de auditoría y en el historial del activo.
- **P44** La búsqueda de usuarios vive en la URL (texto, página y tamaño), como los demás listados.
- **Decisión a revisar:** la lista de «datos del evento» es explícita (`EVENT_FIELDS` en `features/audit/detail.ts`); un campo nuevo que sea dato del
  evento debe agregarse ahí.

## Quinta tanda de revisión de F2 (2026-11-17, mismo PR #5)

Marcas `[P40]` y `[P41]` al final del asunto de cada commit.

- **P40** Auditoría: columna «Registro» con el rótulo del registro afectado (activo: etiqueta + nombre; usuario y catálogo: nombre).
  Se guarda en `audit_log.entity_label` al momento del evento (migración 0011), así que sobrevive a renombres y borrados. Va enlazado a su
  ficha solo si el registro existe y sigue vigente (`entityLinkable`, calculado en la API con `RecordDirectory`). Backfill de lo existente:
  primero el nombre que traía el diff del evento y, si no, el nombre actual; lo irresoluble queda sin rótulo («—»). La baja y la
  restauración guardan situación antes/después, motivo y el estado del activo como contexto.
- **P41** Filtros y búsqueda con un solo componente (`shared/filters/FilterToolbar`) en activos, catálogo, usuarios y auditoría. Escritorio:
  una barra con buscador y botones compactos («Estado ▾», «Categoría ▾», «Ubicación ▾», «+ Filtros»); chips removibles bajo la barra con
  «Limpiar todo» (solo con filtros) y el conteo en la misma línea. Móvil: buscador + «Filtros (n)» que abre un panel inferior con todos los
  filtros y «Ver N resultados». Los filtros siguen en la URL (la auditoría ahora también). Accesibilidad: menús con teclado, chips con nombre
  accesible y axe con el menú, «+ Filtros» y el panel abiertos.
- **Decisión a revisar:** «Limpiar todo» también limpia la búsqueda de texto; el buscador de usuarios y la lista de auditoría siguen sin
  búsqueda en la URL / en el servidor (la auditoría no tiene búsqueda de texto).

## Correcciones de la ficha técnica (2026-11-17, mismo PR #5)

Marcas `[P32]` a `[P36]` al final del asunto de cada commit.

- **P32** El login revoca, en la misma transacción, la sesión previa que traía la cookie (un login fallido no revoca nada).
- **P33** Topes de BD por conexión (`DB_CONNECTION_TIMEOUT_MS` 5 s, `DB_STATEMENT_TIMEOUT_MS` 30 s, `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` 30 s) y
  apagado ordenado con tope (`SHUTDOWN_TIMEOUT_MS` 10 s) de la API y el worker; el proceso termina igual con código 1 pasado el tope.
- **P34** CSRF firmado (HMAC-SHA256 con `CSRF_SECRET`, obligatorio en producción) y ligado al id de sesión (antes del login, a una cookie
  anónima); un token válido de otra sesión se rechaza. Se retira `@fastify/csrf-protection`.
- **P35** Acciones de GitHub fijadas por SHA con la versión en comentario, verificado por `scripts/check-actions-pinned.mjs`; Renovate las agrupa.
- **P36** `requirements.md`, `security.md` y `ficha-tecnica.md` al día; «Diferencias» solo con lo pendiente de F3 (cifrado AES-256-GCM) y F4 (CSP/HSTS).
- **Decisión a revisar:** `CSRF_SECRET` es obligatorio en producción; hay que definirlo en el despliegue (y en `.env.example`, ya agregado).

## Cuarta tanda de revisión de F2 (2026-11-17, mismo PR #5)

Marcas `[P27]` a `[P31]` al final del asunto de cada commit.

- **P27** Orden del listado de activos: en escritorio, encabezados clicables (asc → desc, flecha y `aria-sort`); en móvil, «Ordenar por» y un
  botón de dirección separado. Desaparece el select largo con ↑/↓.
- **P28** El formulario de activo titula la sección «Ubicación» al editar y «Estado y ubicación» solo al crear.
- **P29** La auditoría traduce también los valores enumerados («Tipo de destino: user» → «Usuario»). Los campos enumerados viven en
  `packages/shared` (`AUDIT_ENUM_FIELDS`) y un test falla si falta la traducción de algún valor.
- **P30** Catálogo: cambiar de sección mezclaba datos y congelaba la vista. **Causa raíz**: la consulta del listado usaba
  `placeholderData: keepPreviousData`; al cambiar de sección (el mismo componente, otra clave) conservaba las filas de la sección anterior
  mientras cargaba la nueva y la plantilla de la sección nueva las leía con su propia forma (`displayCells`: `catalog.kinds.undefined`,
  `manufacturer.name` de una ubicación). El `TypeError` salía durante el render y dejaba el árbol del componente roto: la URL seguía
  cambiando pero la vista quedaba pegada. Corrección: el dato previo solo se conserva dentro de la misma sección y la tabla lleva `key` por
  sección. Además un manejador global (`app/errorHandling.ts`) registra y avisa con un toast los errores de render/eventos de Vue, de la
  navegación del router y las promesas rechazadas; una falla de descarga de módulo tras un despliegue recarga la página. Tests: unitario del
  cruce de secciones (falla sin el arreglo) y e2e con la secuencia exacta (360 px, select, escritorio sin recargar, pestañas, «Inicio»).
- **P31** Los buscadores de activos y catálogo no tenían `id` ni `name`; ahora sí, y un e2e recorre todas las pantallas, diálogos y selectores
  abiertos y falla si queda un campo sin ellos.

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

## F3 — LoRaWAN (rama `phase/f3-lorawan`, desde `main`)

**Checklist**

- [x] Dependencias del cliente gRPC de ChirpStack (`@chirpstack/chirpstack-api`, `@grpc/grpc-js`), versiones exactas
- [x] Dominio compartido: formatos EUI/clave, esquemas Zod, estados de registro, acciones de auditoría (RF-21, 5.2)
- [x] Cifrado AES-256-GCM con `APP_ENCRYPTION_KEY` + `key_id` y rotación (RNF, 10.1)
- [x] Migración: `asset_lorawan`, `lns_profiles`, `lns_registrations`
- [x] Extensión LoRaWAN del activo: alta/edición, validación y unicidad de DevEUI, defaults desde el modelo (RF-21)
- [x] Reveal de claves con `lorawan:keys:reveal`, auditado (RF-30)
- [x] Perfiles LNS: CRUD, credencial enmascarada, «Probar conexión» (RF-50 a RF-52)
- [x] Contrato `LnsAdapter` y adaptador ChirpStack v4 (gRPC)
- [x] Adaptador TTN v3 (REST) con compensación AS → NS → JS → IS
- [x] Cola pg-boss y worker: registro, baja, reintento, idempotencia, conflicto/vincular (RF-60 a RF-65)
- [x] Compensación probada simulando fallo en cada paso (a nivel de adaptador; el flujo completo se prueba con el worker)
- [x] Importación CSV por número de serie (RF-66)
- [x] Filtros «estado LNS» y búsqueda por DevEUI en el listado (RF-22)
- [x] UI: sección LoRaWAN de la ficha, registrar/baja/reintentar/vincular, perfiles LNS, importación CSV (360 px, i18n)
- [x] ChirpStack de prueba en `compose.yml` y `compose.e2e.yml` + e2e
- [x] Job manual contra TTN real (sin credenciales)
- [x] `.env.example`, docs, ADR, CHANGELOG, resumen y PR

**Resumen**

- **Datos LoRaWAN (RF-21):** extensión 1:1 del activo con DevEUI único, JoinEUI, AppKey/NwkKey cifradas, clase, versión y región;
  opcional al crear (también por API en el alta) y obligatoria solo al registrar. Defaults desde el modelo.
- **Secretos:** AES-256-GCM con `APP_ENCRYPTION_KEY` + `key_id`, rotación con `cli reencrypt-secrets`, reveal auditado con
  `lorawan:keys:reveal`. Ninguna clave en respuestas, historial, auditoría ni logs (las pruebas revisan `audit_log` completo).
- **Perfiles LNS (RF-50 a RF-52):** ChirpStack v4 (gRPC) y TTN v3 (REST), credencial `•••• últimos4`, Probar conexión con latencia.
- **Registro (RF-60 a RF-65):** estados `registrando → registrado | error | parcial | conflicto`, baja, reintento (automático solo
  para errores transitorios), idempotencia, Vincular/Cancelar y compensación por pasos; cola pg-boss y worker.
- **Importación CSV (RF-66):** vista previa con errores por fila y aplicación todo o nada; probada con 100 series.
- **Listado (RF-22):** filtro por estado LNS y búsqueda por DevEUI; un activo registrado en un LNS no se da de baja.

**Criterio de aceptación de F3 (sección 13)**

| Criterio                                                                   | Cómo se probó                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registro y baja OK contra ChirpStack de prueba en Docker                   | `e2e/tests/lorawan.spec.ts` (ChirpStack 4.20.0 real en `compose.e2e.yml`, cola y worker reales, desktop y 360 px) y `chirpstack.real.int.test.ts`                                     |
| TTN con mock en CI                                                         | `ttn.test.ts` (servidor HTTP de prueba, 17 casos)                                                                                                                                     |
| TTN con una aplicación real en el job manual                               | Preparado: `.github/workflows/ttn-real.yml` + `ttn.real.int.test.ts`; **sin credenciales** (secretos `TTN_TEST_*`, Q48)                                                               |
| Compensación simulando fallo en cada paso                                  | TTN: fallo en IS, JS, NS y AS (con y sin fallo del borrado anterior, 409, 5xx, timeout); ChirpStack: fallo en `CreateKeys`; flujo completo (parcial → reintento) en `lns.int.test.ts` |
| CSV de 100 series asocia a los activos correctos y rechaza filas inválidas | `import.int.test.ts` (100 series; filas inexistentes, repetidas, formato, DevEUI ajeno, baja, categoría; nada se aplica con errores) y e2e                                            |

**Pruebas**

- Shared 42, API 166 unitarias + 222 de integración con Postgres 18 (+5 opt-in contra ChirpStack/TTN reales), Web 300.
- e2e (Playwright + axe, escritorio y 360 px, claro y oscuro): 14 nuevos de LoRaWAN; suite completa en verde.
- Cobertura de la API sobre los umbrales (líneas 91,7 %, ramas 82,5 %).

**Hallazgos de las pruebas contra un ChirpStack real** (corregidos, con su prueba; detalle en el ADR 0007)

- Con una API key de tenant, `Get`/`Delete` de un dispositivo inexistente responden `UNAUTHENTICATED`, no `NOT_FOUND`.
- Un DevEUI repetido responde `INTERNAL` («duplicate key»), no `ALREADY_EXISTS`: es conflicto, no un error a reintentar.
- En LoRaWAN 1.0.x la AppKey queda en `nwk_key` (verificado leyendo las claves de vuelta); `DeviceService.List` no busca por DevEUI.
- El e2e detectó íconos Lucide fuera del bundle (se habrían pedido a un dominio externo): ahora hay una prueba que lo impide y
  se corrigieron tres de F2 que ya estaban en ese caso.

**Decisiones provisionales** (detalle en `docs/open-questions.md`, Q40 a Q50): `asset:write` edita datos y claves (de solo
escritura), sin permiso nuevo; clase/versión/región se copian del modelo; un perfil con dispositivos no cambia de destino;
dar de baja un vinculado solo lo desvincula; 5 intentos con 30 s de espera creciente; la ficha consulta cada 2 s; el alta en
lote y el formulario de alta individual no llevan campos LoRaWAN (se completan en la ficha o por CSV); formato del CSV;
ChirpStack de prueba fijado por digest; sin barrido de registros atascados.

**Pendiente / no verificado**

- **TTN contra una aplicación real:** los `field_mask` y atributos siguen la documentación, no se pudieron verificar sin
  credenciales. El responsable del proyecto debe agregar los secretos `TTN_TEST_*` y ejecutar el workflow «TTN real (manual)»
  (ver `docs/development.md`).
- El workflow de CI no se ha ejecutado en GitHub todavía con los cambios de F3 (job `e2e` ahora levanta ChirpStack; la primera
  corrida real es la del PR).
- Dependencias nuevas a revisar (justificadas en el PR): `@chirpstack/chirpstack-api` 4.20.0, `@grpc/grpc-js` 1.14.7,
  `google-protobuf` 3.21.4 y `@types/google-protobuf` 3.15.12 (dev).

**Cómo probarlo**

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @inventarius/api test:int                      # Postgres 18 en contenedor
docker compose -f compose.e2e.yml up -d --build --wait web worker
docker compose -f compose.e2e.yml run --rm --build e2e       # incluye LoRaWAN contra ChirpStack real
docker compose -f compose.e2e.yml down --volumes
```

Desarrollo manual con ChirpStack: ver `docs/development.md` (perfil `chirpstack` de `compose.yml`).

**Corrección del CI del PR #6 (2026-11-19)**

- **Causa:** el job «Integración» fallaba con `ERR_RESOLVE_PACKAGE_ENTRY_FAIL` para `@inventarius/shared`. El `globalSetup` del
  proyecto `int` importa `migrator.ts` y, con él, `@inventarius/shared`; Vitest no le aplica la condición `inventarius-source`
  declarada dentro de cada proyecto, así que resolvía el export `default` (`./dist/index.js`), que en CI no existe. En local
  funcionaba por un `packages/shared/dist` viejo.
- **Arreglo:** la condición se declara también a nivel raíz de `apps/api/vitest.config.ts` (con el porqué en un comentario), y
  `migrator.ts` ya no importa módulos de negocio: los nombres de colas viven en `core/queues.ts`. Sin paso de build de `shared` en CI.
- **Verificado** con `packages/shared/dist` borrado: `test:coverage` de la API verde (388 pruebas, umbrales cumplidos). El workflow
  `ttn-real.yml` ejecuta la misma configuración de Vitest, así que queda cubierto.
- Regla nueva en `CLAUDE.md`: no se cierra un PR con checks en rojo.

## F3 revisión

Revisión manual del PR #6 contra ChirpStack 4.20.0 (2026-11-19). Cada punto va en su propio commit.

- [x] P1 «Probar conexión»: un solo mensaje cuando todas las verificaciones fallan por la misma causa
- [x] P2 Registro valida versión, clase y región contra el device profile; identidad bloqueada si registrado o vinculado; aviso al editar
- [x] P3 El adaptador de ChirpStack envía el JoinEUI; test que compara campo por campo contra el LNS
- [x] P4 `chirpstack-bootstrap` crea el device profile con un ADR algorithm válido
- [x] P5 Conflicto: el mensaje sale una sola vez
- [x] P6 Vincular: lee el remoto, muestra diferencias, adoptar o cancelar; la ficha muestra lo que tiene el LNS
- [x] P7 «Desvincular» sin estilo destructivo
- [x] P8 Una tabla de traducciones para historial y Auditoría, sin claves internas ni valores crudos
- [x] P9 Confirmación con lo que se va a enviar antes de encolar el registro
- [x] P15 El actor del worker se muestra como «Sistema» en todas las vistas
- [x] P16 Pluralización «Importar 1 dispositivo»
- [x] P17 Botones desactivados se ven desactivados y con tooltip del motivo
- [x] P18 Número de serie único sin distinguir mayúsculas
- [x] P19 Los eventos de auditoría por activo de una importación CSV referencian el id del lote
- [x] P20 La importación aplica los defaults del modelo (clase, versión, región)
- [x] P21 Auditoría sin scroll horizontal en escritorio; tarjetas en 360 px
- [x] P22 En producción la app no arranca sin `APP_ENCRYPTION_KEY` o con el valor por defecto de `compose.yml`
- [x] P23 Informe: TLS con CA propia en el adaptador de ChirpStack (`docs/open-questions.md`)

**Resumen de la revisión (2026-11-19)**

- Todos los puntos P1 a P9, P15 a P23 quedaron hechos (P10 a P14 no se pidieron). Un commit por punto, salvo P16 y P17 (mismo
  commit: tocan los mismos archivos) y P2/P6, que llevan un commit de API y otro de la interfaz.
- **Verificado contra ChirpStack 4.20.0 real** (`chirpstack.real.int.test.ts`, 7 pruebas): el JoinEUI llega al LNS y se lee de
  vuelta campo por campo, el device profile del bootstrap lleva ADR algorithm, `readDevice` y `describeDeviceProfile`.
- **e2e** (Playwright, escritorio y 360 px, sobre un stack limpio): 127 pasaron y 3 se omiten (los mismos de antes); nuevos: Auditoría sin
  desborde a 1280, 1024, 800, 768 y 360 px, y el flujo de vincular contra un dispositivo ajeno real de ChirpStack
  (`chirpstack-bootstrap` crea dos, uno por proyecto) con lectura, diferencias, adopción, ficha y «Desvincular».
- Migraciones nuevas: 0014 (serie única sin distinguir mayúsculas; se detiene y lista los duplicados si los hay) y 0015
  (`lns_registrations.remote_snapshot`).
- Decisiones provisionales nuevas en `docs/open-questions.md`: Q51 (informe TLS con CA propia, P23), Q52 (serie única),
  Q53 (máscara de la AppKey), Q54 (qué se adopta al vincular).

**Pendiente / no verificado**

- **TTN:** la lectura para vincular (`readDevice`) y la región por plan de frecuencias siguen la documentación; no se probaron
  contra una aplicación real (mismo límite que Q48, requiere los secretos `TTN_TEST_*`).
- El CI de GitHub no se esperó (instrucción del responsable): los checks del PR #6 los revisa el responsable.
- La migración 0014 puede abortar si la base ya tiene números de serie repetidos sin distinguir mayúsculas; el mensaje los lista.

### Backlog post-F3

Para una fase de endurecimiento; **no se implementa en F3**.

- **Bajas con aprobación (decidido).** Solicitar una baja deja el activo en «baja solicitada» y el dispositivo sigue en el
  LNS. La ejecuta otra persona con el rol aprobador: mínimo dos personas con ese rol y sin autoaprobación. Se puede rechazar
  con motivo o cancelar; hay bandeja de pendientes con antigüedad y aviso; una baja masiva es una sola solicitud; los
  permisos `lorawan:deregister:request` y `lorawan:deregister:approve` van separados. Lo vinculado nunca se borra del LNS.
- Solo borrar en el LNS dispositivos que Inventarius registró (validado contra `lns_registrations` y el tag
  `inventarius_asset_id`).
- Progreso por paso del registro (`stepsDone`) visible en la ficha cuando queda parcial o falla.
- Última actividad del LNS (`last_seen`) en la ficha y filtro «registrado sin actividad».
- Plantilla de nombre y descripción por perfil LNS, con el límite de largo de cada LNS y bloqueo si la descripción contiene
  una clave.
- Registro por lote desde el listado, por la cola y con progreso.
- Defaults de modelo con plan de frecuencia y sub-banda (por ejemplo AU915 FSB2). En ChirpStack corresponde a la
  «region configuration» del device profile.
- **Prefijo de etiqueta configurable en el primer arranque** (asistente o CLI `init`): de 2 a 6 caracteres alfanuméricos,
  guardado en la base (la variable de entorno queda solo como sugerencia), en mayúsculas en la etiqueta y en minúsculas en
  los IDs del LNS, y bloqueado al crear el primer activo. Los ejemplos del repo siguen usando `INV`.
- **Plantilla de nombre en el LNS por perfil**, por defecto `<iniciales-modelo>-<serie>-<etiqueta>`. En TTN, el device ID
  se basa en la etiqueta (minúsculas, máximo 36 caracteres).
- **TLS con CA propia por perfil LNS** (cierra Q51): requisito antes de conectar un ChirpStack que no sea de desarrollo.

## F3 revisión 2

Segunda revisión manual del PR #6 (2026-11-19). Cada punto va en su propio commit.

- [x] P18b Serie única por (modelo, serie) sin distinguir mayúsculas; el CSV empareja por serie y desempata con la columna «modelo»
- [x] R1 Versión LoRaWAN y región faltantes en el activo se toman del device profile al registrar
- [x] R2 AppKey enmascarada de la confirmación sin partirse en dos líneas
- [x] R3 Las pruebas contra ChirpStack real borran lo que crean, usan prefijo por corrida y exigen endpoint marcado como de prueba
- [x] R4 Vincular: un JoinEUI en ceros no pisa el local; el usuario elige por campo qué adoptar
- [x] R5 Vincular muestra el device profile con nombre, versión y región
- [x] R6 Vincular advierte si el dispositivo remoto no tiene AppKey/NwkKey (no podrá hacer join)

**Resumen de la revisión 2 (2026-11-19)**

- Todos los puntos (P18b, R1 a R6) quedaron hechos, un commit por punto. Migración nueva: 0016 (serie única por
  `(model_id, lower(serial))`; se detiene y lista los duplicados dentro de un mismo modelo). Q52 y Q54 actualizadas; Q55 nueva (R1).
- **Pruebas:** shared 42, API 200 unitarias + 249 de integración con Postgres 18 (+8 opt-in), Web 355. e2e sobre un stack
  limpio (escritorio y 360 px): 127 pasaron y 3 se omiten (los mismos de antes); el e2e de LoRaWAN comprueba que la máscara
  de la AppKey cabe en una línea, el device profile con nombre y que no queda nada registrado al terminar.
- **ChirpStack de desarrollo:** se borraron de él los dos dispositivos «ajenos» del bootstrap y los dos «Sensor de prueba» que
  dejó `chirpstack.real.int`. Quedan «creado a mano» y «INV-000016 pruebaCSV1» (registrado desde la app de
  desarrollo, no era de las pruebas).

**Pendiente / no verificado**

- El CI de GitHub no se esperó (instrucción del responsable).
- Una instalación con series repetidas dentro de un mismo modelo hará abortar la migración 0016; el mensaje las lista.
- TTN: las lecturas para vincular siguen sin probarse contra una aplicación real (Q48).

## F3.5 — Consumibles por cantidad (rama `phase/f3.5-consumibles`, desde `main`)

Alcance: RF-70 a RF-74 y las decisiones D1 a D14 del prompt de arranque. Decisiones provisionales en `docs/open-questions.md`
(Q56 en adelante) y ADR 0008.

- [x] Migraciones: unidades de medida, consumibles, mínimos por bodega, libro de movimientos (con FK de anulación y de traslado), saldos si aplica, CHECK de no negativo
- [x] Semilla de unidades y permisos nuevos con mapeo a roles
- [x] Esquemas Zod compartidos con validación de decimales por unidad
- [x] Dominio y servicio de consumibles (CRUD, desactivar, borrar solo sin movimientos), TDD
- [x] Servicio de movimientos: ingreso, entrega, ajuste, traslado, anulación, TDD
- [x] Bloqueo por (consumible, bodega) y test de concurrencia
- [x] Test y CLI de cuadratura libro vs saldo
- [x] Rutas de la API con permisos y auditoría
- [x] Catálogo de unidades administrable (API y UI)
- [x] UI: listado de consumibles con stock total, filtro «Bajo mínimo» e inactivos
- [x] UI: ficha del consumible con stock por bodega, mínimos e historial filtrable
- [x] UI: ingreso a bodega
- [x] UI: entrega (usuario o texto libre) con tope de stock visible
- [x] UI: traslado entre bodegas
- [x] UI: ajuste con motivo y confirmación antes/después
- [x] UI: anular con motivo y enlace entre movimientos
- [x] Aviso de stock mínimo en Inicio
- [x] Traducciones de auditoría e historial para todos los eventos nuevos
- [x] Responsive 360 px y axe sin violaciones en las pantallas nuevas
- [x] e2e del ciclo ingreso → entrega → traslado → ajuste → anulación → aviso de mínimo, verificando que el stock mostrado cuadra con el libro
- [x] Documentación: requirements (si precisas algo), ficha técnica, ADR 0008 de consumibles, CHANGELOG, open-questions
- [x] Resumen, decisiones provisionales, cómo probar y sección de revisión manual en docs/progress.md

### Resumen de F3.5 (2026-11-20)

- **Qué hay:** consumibles con categoría (catálogo reutilizado con ámbito), unidad de medida administrable (0 a 3 decimales) y
  mínimo global y por bodega; ingreso, entrega (usuario o texto libre), traslado atómico, ajuste y anulación sobre un libro de
  movimientos append-only; saldo por (consumible, bodega) bloqueado `FOR UPDATE` con `CHECK` de no negativo; aviso de mínimo en
  listado, ficha e Inicio; auditoría traducida; `cli verify-consumables`. Migración 0017, ADR 0008, Q56 a Q69.
- **Pruebas** (al cerrar la fase, antes de la revisión): shared 55, API 206 unitarias + 295 de integración con Postgres 18 (46 son de consumibles: permisos por rol,
  decimales, concurrencia real, anulaciones, libro vs saldo, append-only, auditoría), web 398. e2e (Playwright + axe, escritorio y
  360 px, claro y oscuro) sobre un stack limpio: **137 pasaron y 3 se omiten** (los mismos de antes); 10 son nuevas
  (`consumables.spec.ts`): el ciclo completo con comprobación de que el stock de la pantalla es la suma del libro, el rechazo de
  anular un ingreso ya entregado, permisos por rol, y desborde y axe del listado, la ficha y los diálogos.
- **Cosas que encontraron las pruebas** (corregidas):
  - El hover del botón primario sólido (primario al 75 %) daba 3,35:1 de contraste con el texto (WCAG AA pide 4,5:1): axe lo
    midió en el diálogo de anular con el puntero encima. Se oscurece en claro y se aclara en oscuro (`theme.ts`).
  - La barra inferior móvil pasó de 4 a 5 destinos al agregar «Consumibles»; el e2e lo refleja y no hay desborde a 360 px.
  - La base de e2e es compartida: un test que esperaba su consumible en el listado «Bajo mínimo» ahora lo acota por nombre.
- **Decisiones provisionales** (detalle en `docs/open-questions.md`, Q56 a Q69): la bodega es una ubicación de tipo bodega; la
  unidad lleva nombre en plural para decir «1 par»/«12 pares» (D4 no lo pedía); una unidad en uso no baja de decimales; las
  categorías de consumibles se escriben con `catalog:write`; «bajo mínimo» es estrictamente menor y los desactivados no
  avisan; un traslado se anula entero desde cualquiera de sus lados; Q60 (qué otros roles deberían tener `consumables:adjust`)
  queda **abierta para Rodrigo**.
- **Fuera de alcance** (en el backlog de abajo): importación CSV de ingresos, exportación de stock, devoluciones como tipo propio,
  costos y valorización, lotes y vencimientos, correos por stock mínimo.

**Cómo probarlo**

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test                 # unitarios (shared, api, web)
pnpm --filter @inventarius/api test:int src/modules/consumables   # integración (Postgres 18 en Docker)
docker compose -f compose.e2e.yml up -d --build --wait web worker
docker compose -f compose.e2e.yml run --rm --build e2e pnpm exec playwright test consumables
docker compose -f compose.e2e.yml down --volumes
docker compose exec api pnpm --filter @inventarius/api cli verify-consumables   # cuadratura libro vs saldo
```

**Pendiente / no verificado**

- El CI de GitHub no se esperó (instrucción del responsable): los checks del PR los revisa el responsable.
- `assets.perf.int` (RNF-06) falló una vez con `pnpm test:coverage` mientras corría el stack de e2e en la misma máquina (p95 de
  395 ms por la carga); aislado pasa. No toca código de F3.5.
- No se probó con un lector de pantalla real, solo axe.

### Revisión manual de F3.5

Para que Rodrigo recorra la fase en su entorno de desarrollo.

- **Levantar:** `docker compose up --build` (no hace falta ningún perfil; el perfil `chirpstack` es de F3). Web en
  http://localhost:5173, API en http://localhost:3000, Postgres en `127.0.0.1:5432`.
- **Usuarios de prueba** (datos inventados):
  1. Administrador (tiene `consumables:adjust` y `consumables:reverse`): `docker compose exec api pnpm --filter @inventarius/api cli create-admin --email admin@example.test --name "Admin de prueba"`.
  2. Operador (ajusta, pero no anula): en Usuarios, «Nuevo usuario» con rol Operador (por ejemplo `operador@example.test`);
     entra con la contraseña temporal y la cambia.
  3. Para probar los permisos por separado (P2), en Roles crea uno con solo `consumables:read` y `consumables:adjust`, y otro
     con solo `consumables:read` y `consumables:reverse`.
- **Datos de ejemplo** (todo por la interfaz):
  1. Catálogo → Ubicaciones: «Bodega central» y «Bodega anexo», tipo Bodega.
  2. Catálogo → Categorías de consumibles: «EPP».
  3. Catálogo → Unidades de medida: ya están unidad, par, caja, litro, metro y kilogramo.
  4. Consumibles → Nuevo: «Guantes de nitrilo», EPP, par, mínimo global 20 y mínimo de 5 en la Bodega anexo. Otro: «Alcohol gel»,
     litro (admite 3 decimales), mínimo 2.
- **Qué mirar:**
  - Ingresa 12 pares a la central: el listado dice «12 pares» y «Bajo mínimo» (12 < 20); Inicio muestra el aviso con el enlace al
    listado filtrado. Con 2,5 litros de alcohol se lee «2,5 L».
  - Intenta ingresar «2,5» pares: la unidad no admite decimales. Intenta entregar más de lo que hay: el tope se ve en el diálogo.
  - Entrega 3 pares a «Persona Inventada» con identificador libre y a un usuario del sistema; traslada 4 a la anexo; mira el
    historial (fechas `dd-mm-aaaa HH:mm`, «Ver más», filtros por bodega, tipo y fecha).
  - Como Operador: ves «Ajustar» pero no «Anular». Como Administrador: ajusta con motivo «Otro» (la nota es obligatoria) y mira la
    confirmación con el saldo antes y después.
  - Anula una entrega sin devoluciones: el historial enlaza «Anulado por…» y «Anula a…». Intenta anular un ingreso cuyo stock ya se entregó: lo
    rechaza diciendo que dejaría el stock negativo. Anula un traslado: se revierten las dos bodegas.
  - Desactiva un consumible: ingresar, entregar y trasladar se ven apagados con el motivo al pasar el cursor; ajustar sigue.
    «Eliminar» está apagado si tiene movimientos.
  - Auditoría: filtra por entidad «Consumible»; todos los eventos salen en español, con cantidades en coma decimal.
  - 360 px: listado y ficha en tarjetas, sin scroll horizontal; la barra inferior tiene cinco destinos.
  - `docker compose exec api pnpm --filter @inventarius/api cli verify-consumables` debe decir que cuadra.

## F3.5 revisión

Revisión manual del PR #7 (decisiones de Rodrigo, mandan sobre las provisionales de Q56 a Q69). Un commit por punto; cada punto se
marca aquí junto con su commit. Cómo probar cada uno: ver «Cómo probar la revisión» al final de esta sección.

- [x] P1 Devolución como movimiento propio (`return`)
- [x] P2 Permisos separados: `consumables:adjust` y `consumables:reverse`
- [x] P3 Auditoría de la anulación con el detalle completo del movimiento anulado
- [x] P4 Categorías de consumibles con `consumables:manage` y unicidad por (ámbito, nombre)
- [x] P5 Concurrencia del primer movimiento en una bodega sin fila de saldo
- [x] P6 Fecha pasada solo en el ingreso (máx. 90 días) y «Registrado el…» en el historial
- [x] P7 Bodega inactiva con stock: salidas sí, entradas no
- [x] P8 Traslado como una sola entrada del historial
- [x] P9 «Bajo mínimo» explícito (motivo en la insignia y bodegas nombradas en la ficha)
- [x] P10 Inicio: «Últimos movimientos» incluye consumibles
- [x] P11 Auditoría de consumibles con orden fijo de campos y «Bodega»
- [x] P12 Íconos distintos por tipo de movimiento
- [x] P13 Selectores de bodega con nombre, ruta y stock, sin truncar
- [x] P14 Resaltado visible de «Ir al movimiento»
- [x] P15 Validación de obligatorios solo tras interactuar o enviar
- [x] P16 Botones de la ficha a 360 px: grilla de dos columnas del mismo tamaño
- [x] P17 Subtítulo de Catálogo
- [x] P18 Activar/desactivar inequívoco en las tablas del catálogo

### Resultado de la revisión (2026-11-20)

- **Pruebas:** shared 57, API 208 unitarias + 330 de integración con Postgres 18 (incluye las migraciones 0018 a 0020 sobre
  datos existentes, la concurrencia del primer movimiento y los permisos por rol), web 462. e2e (Playwright + axe, escritorio y 360
  px, claro y oscuro) sobre un stack limpio: **todo en verde** (los 3 omitidos de siempre); casos nuevos de devolución, permisos
  separados, bodega inactiva, fecha fuera de rango, traslado único con resaltado y botones del mismo tamaño, Inicio y
  confirmación de desactivar.
- **Cosas que encontraron las pruebas** (corregidas, cada una con su test):
  - El motivo de anulación salía en rojo al abrir: Nuxt UI trata cualquier `error` distinto de `undefined` (también `''`) como
    error; el mismo defecto estaba en el diálogo de acciones de activos [P15].
  - Con más de 100 bodegas en la base compartida del e2e, una quedaba fuera del selector: ahora se piden todas las páginas [P13].
  - En móvil, la tarjeta de stock no mostraba «Bodega inactiva» [P7].
  - Un defecto latente que el e2e `catalog-navigation` destapó en móvil (50 % de fallos): el buscador aplica su cambio 300 ms
    después y, si en ese lapso se pulsaba «Inicio» y Inicio tardaba en cargar (ahora importa más módulos), `router.replace`
    cancelaba la navegación y la URL volvía al listado. `useListQuery` ya no reescribe la URL mientras hay una navegación a otra
    ruta en curso.
  - El historial devuelve un traslado como una sola fila: el helper de cuadratura del e2e (stock = suma del libro) aplica la
    cantidad a las dos bodegas.
- **Decisiones registradas** (`docs/open-questions.md`): Q57, Q60, Q63 y Q65 cerradas o modificadas; Q70 a Q74 nuevas (bodega
  inactiva, traslado en el historial, Inicio, orden de la auditoría, selector de bodega). Las dudas se resolvieron por lo
  conservador: anular sigue sin mirar si la bodega está activa; un consumible inactivo no admite devoluciones; la migración 0019 no
  quita la anulación a quien ya podía anular.
- **Fuera de alcance:** prueba con lector de pantalla real (ver el backlog).

### Cómo probar la revisión

- **P1:** ingresa 10, entrega 4 a una persona, «Registrar devolución» en la fila de la entrega: 1 → la entrega dice «Devuelto 1 par de
  4 pares»; intenta devolver 4 (rechaza: solo quedan 3); elige otra bodega activa; intenta anular la entrega (rechaza: primero
  anula la devolución); anula la devolución y luego la entrega. Como Lector: no aparece la acción.
- **P2:** como Operador ves «Ajustar» pero no «Anular»; como Administrador ves ambos. En Roles crea uno con solo
  `consumables:adjust` (ajusta, no anula) y otro con solo `consumables:reverse` (anula, no ajusta).
- **P3:** anula una entrega con identificador, un ajuste con nota y un traslado; en Auditoría, entidad «Consumible», cada
  «Anulación de movimiento» lista el tipo, cantidad, unidad, bodega(s), saldos antes y después, receptor, motivo y nota
  originales, motivo de la anulación, quién registró el movimiento y sus fechas.
- **P4:** con un rol que solo tenga `consumables:read` y `consumables:manage`, Catálogo → Categorías de consumibles permite
  crear, editar y desactivar; Categorías (de activos) no ofrece alta. Con `asset:read` y `catalog:write` (sin `manage`) ocurre
  lo contrario. «Cables» se puede crear una vez como categoría de activos y otra como de consumibles, pero no dos veces en el mismo ámbito.
- **P5:** no hay nada que probar a mano: `pnpm --filter @inventarius/api test:int` incluye ocho ingresos simultáneos y ocho traslados
  simultáneos hacia una bodega sin fila de saldo. `lockStock` ya hacía `INSERT ... ON CONFLICT DO NOTHING` antes del
  `FOR UPDATE`, así que las pruebas pasaron sin cambiar código: quedan como guarda contra una regresión.
- **P6:** Ingresar con fecha de hace 10 días: el historial muestra solo «10-11-2026» y debajo «Registrado el … por …»; uno de
  hoy muestra fecha y hora. Fecha de hace más de 90 días o futura: el diálogo y la API la rechazan. Entrega, traslado y ajuste no
  tienen campo de fecha. En Auditoría, el ingreso muestra «Fecha del ingreso» y «Registrado el».
- **P7:** con 10 unidades en una bodega, desactívala en Catálogo → Ubicaciones: la confirmación dice «hay stock de 1
  consumible…». Después, en la ficha del consumible: Entregar, Trasladar (como origen) y Ajustar restando siguen eligiéndola (con
  el aviso «Bodega inactiva: solo se puede sacar stock»); Ingresar, el destino de un traslado, la devolución y Ajustar sumando la
  muestran apagada con «Bodega inactiva: solo admite salidas». Una bodega sin stock aparece apagada al sacar («Sin stock»).
- **P8:** traslada 4 de la central al anexo: el historial muestra una sola entrada «Traslado: Bodega central → Bodega anexo, 4 pares» con un botón «Anular»; al anularla aparece una sola entrada «Anulación de traslado: Bodega anexo → Bodega central, 4 pares». Filtra por la central y por el anexo: el traslado sale en las dos. El filtro de tipo tiene un solo «Traslado». El libro sigue con dos filas por traslado (`cli verify-consumables` cuadra).
- **P9:** en el listado, un consumible con 27 pares, mínimo global 20 y 1 bodega bajo su mínimo muestra la insignia «1 bodega bajo mínimo» (no «Bajo mínimo» a secas); si es el total el que está bajo, dice «Bajo mínimo global» (con ambos, «Bajo mínimo global · 2 bodegas bajo mínimo»). En la ficha, la alerta nombra cada bodega: «En «Bodega anexo» hay 2 pares y su mínimo es 5 pares.»
- **P10:** en Inicio, «Últimos movimientos» mezcla por fecha los eventos de activos y los movimientos de consumibles (ordenados por cuándo se registraron), con el formato del historial («Entrega −3 pares · Guantes de nitrilo», «Traslado: origen → destino, 2 pares»); cada uno enlaza a su consumible. Un rol con solo `consumables:read` ve solo los de consumibles; uno sin ese permiso no los ve.
- **P11:** en Auditoría, entidad «Consumible», los eventos de movimientos listan siempre: (tipo / movimiento anulado), cantidad, unidad, bodega (o bodega de origen y de destino), saldo antes, saldo después, receptor, motivo, nota y fechas, en ese orden; el lugar se rotula «Bodega», no «Ubicación». Un traslado trae el saldo antes y después de las dos bodegas; una devolución, «Devuelto 1 par de 3 pares».
- **P12:** en la ficha de un consumible con movimientos, los botones Ingresar (caja con +), Entregar (mano), Registrar devolución (flecha de regreso), Trasladar (flechas cruzadas), Ajustar (balanza) y Anular (círculo tachado) tienen cada uno su ícono, y el historial usa el mismo ícono para cada tipo de movimiento. Todos están en `APP_ICONS` (la prueba de íconos empaquetados lo verifica).
- **P13:** todos los selectores de bodega (ingreso, entrega, traslado origen y destino, ajuste, devolución, mínimos por bodega y filtro del historial) usan el mismo selector: nombre destacado, ruta de los padres en una segunda línea más chica y el stock de ese consumible a la derecha; los nombres largos pasan a otra línea (también el valor elegido en el campo) en escritorio y a 360 px. Abre «Trasladar» y compara origen y destino: tienen el mismo formato.
- **P14:** anula un movimiento y, en la anulación, pulsa «Ir al movimiento»: el movimiento original se marca con borde y fondo del color primario durante unos 3,5 s y se desvanece (con «reducir movimiento» del sistema, se apaga sin fundido); el foco queda en él. El contraste del texto sobre ese fondo es AA en claro y oscuro (comprobado en `theme.test.ts`).
- **P15:** abre «Anular» en un movimiento (y cada diálogo de consumibles: ingreso, entrega, traslado, ajuste, devolución, alta y edición): ningún campo aparece en rojo ni hay mensajes hasta que escribes o pulsas el botón; recién al enviar vacío el motivo se marca y dice «Este campo es obligatorio». Causa: Nuxt UI pinta de error cualquier `error` distinto de `undefined`, también `''`; el mismo defecto estaba en el diálogo de acciones de activos (también corregido).
- **P16:** abre la ficha de un consumible a 360 px con un rol que tenga todos los permisos: los botones (Ingresar, Entregar, Trasladar, Ajustar, Editar, Desactivar, Eliminar) forman una grilla de dos columnas a ancho completo, todos del mismo tamaño y con los primarios (Ingresar y Entregar) primero; desde 640 px vuelven a ser una fila de botones. Un botón apagado conserva el tamaño y explica el motivo.
- **P17:** en Catálogo, el subtítulo dice «Categorías, fabricantes, modelos, ubicaciones y estados de los activos; categorías de consumibles y unidades de medida.»
- **P18:** en Catálogo (tabla y tarjetas) y en la ficha de un consumible, activar/desactivar usa los íconos de encendido (apagar para «Desactivar», encender para «Activar») con su tooltip, en lugar del ojo. Desactivar siempre pide confirmación diciendo qué implica (en una bodega con stock, cuántos consumibles); activar no pregunta. Usuarios no tiene este botón: se desactiva desde su formulario, con su propio aviso.

## F3.5 revisión 2

Segunda revisión manual del PR #7 (D3 se descartó; la numeración salta). Un commit por punto; cada punto se marca
aquí junto con su commit. Cómo probar cada uno: «Cómo probar la revisión 2» al final de esta sección.

- [x] D1 Devolución: la persona se etiqueta «Devolvió» (historial y auditoría)
- [x] D2 Diálogo de devolución: el límite es lo pendiente de devolver
- [x] D4 Filas anuladas: primero la línea de origen y después «Anulado por…»
- [x] D5 Permisos de consumibles traducidos en la matriz de roles (con test de cobertura)
- [x] D6 Confirmaciones estructuradas (ajuste y patrón común)
- [x] D7 Diálogo de ajuste: una sola línea de stock disponible
- [x] D8 Descripciones de los roles semilla con sus permisos de consumibles
- [x] D9 Auditoría de una anulación: motivo primero y solo campos aplicables
- [x] D10 La devolución indica a qué entrega pertenece (auditoría)
- [x] D11 Auditoría de categorías de consumibles sin «Tipo de extensión»
- [x] D12 Nombre duplicado en categorías de consumibles
- [x] D13 Renombrar o desactivar categoría/unidad en uso: «Afecta a N consumibles»
- [x] D14 Confirmación de desactivar una bodega con stock (formato D6)
- [x] D15 Formato corto del traslado en todas partes
- [x] D16 Mínimos de una bodega inactiva no generan aviso
- [x] D17 Buscador de los selectores de bodega: «Buscar bodega…»
- [x] D18 Auditoría de mínimos por bodega: solo lo que cambió
- [x] D19 «Stock por bodega»: nombre y ruta en segunda línea
- [x] D20 Filtros del historial a 360 px: botón «Filtros» y chips
- [x] D21 «Ir al movimiento» sin cortarse entre líneas
- [x] D22 Inicio: «Activos disponibles por bodega»
- [x] D23 Diálogo «Asignar activo» (y demás de activos): Persona sin error falso

### Resultado de la revisión 2 (2026-11-22)

- **Pruebas:** shared 57, API 208 unitarias y 337 de integración con Postgres 18 (8 omitidas de siempre), web 515. e2e (Playwright
  - axe, escritorio y 360 px) de `consumables`, `inventory`, `admin` y `home-dashboard`: **en verde** (los 2 omitidos de siempre).
- **Cosas que encontraron las pruebas:** el e2e destapó cuatro casos que dependían de textos que esta revisión cambió a propósito
  (el máximo de la devolución, el buscador del selector de bodegas, la confirmación del ajuste y la de desactivar una bodega) y un
  helper de PATCH sin token CSRF; se actualizaron. `dialogErrors.test.ts` falla sin la corrección de D23 (comprobado).
- **Decisiones registradas:** Q75 a Q82 en `docs/open-questions.md`. Las más relevantes: los eventos de auditoría ya guardados no
  se reescriben (D9, D10); el filtro de bodega del historial usa la barra de F2 y deja `WarehouseSelect` solo en los diálogos
  (D20); el texto «solo un administrador puede anularlo» se usó tal cual aunque anular sea un permiso (D6).
- **Pendiente:** ver el backlog de abajo. No se esperó el CI ni se hizo merge.

### Cómo probar la revisión 2

Notas de proceso: cada punto es un commit con su test; el hook de pre-commit corre lint, typecheck y gitleaks, y la batería
completa (`pnpm test`, más `pnpm --filter @inventarius/api test:int`) se corrió al cerrar la tanda. D6 y D7, D9 y D10, D11 y D12
comparten commit porque tocan las mismas líneas. Decisiones nuevas: Q75 a Q82 en `docs/open-questions.md`.

- **D1:** en el historial, una devolución dice «Devolvió: <persona>» (la entrega sigue con «Recibió»). En Auditoría, el evento
  «Devolución» y la «Anulación de movimiento» de una devolución rotulan «Devolvió».
- **D2:** «Registrar devolución» en una entrega de 4 con 1 devuelto: «Máximo a devolver: 3 pares». Escribe 4 y envía: «No puede
  superar lo pendiente de devolver (3 pares)». Ya no menciona el stock de la bodega.
- **D4:** anula una devolución: su fila muestra primero «Devuelve la entrega del…» y después «Anulado por…» (y en una
  anulación, «Anula…» antes que «Anulado por…»).
- **D5:** Roles → «Nuevo rol»: los siete permisos de consumibles salen como «Ver consumibles», «Gestionar catálogo de
  consumibles», «Ingresar a bodega», «Entregar y registrar devoluciones», «Trasladar entre bodegas», «Ajustar stock» y «Anular
  movimientos». `permissions.test.ts` falla si cualquier permiso del sistema queda sin traducción (y si sobra una traducción).
- **D6 y D14:** ajuste: «Revisar ajuste» abre una confirmación con filas Bodega, Sentido, Cantidad, **Saldo «35 → 34»**
  (destacado), Motivo y Nota, y cierra con «Queda en el libro y no se puede editar; solo un administrador puede anularlo».
  Desactivar una bodega con stock: «Stock en esta bodega: N consumibles» destacado y la lista corta de lo que se bloquea (sin
  ingresos, traslados hacia ella, devoluciones ni ajustes que sumen; sí permite sacar stock). Desactivar o eliminar un consumible
  usa el mismo formato.
- **D7:** en «Ajustar», con una bodega elegida hay una sola línea bajo la cantidad: «Disponible en <bodega>: N» al sumar y
  «Máximo a restar en <bodega>: N» al restar.
- **D8:** Roles: las descripciones de Administrador, Operador, Técnico de campo y Lector mencionan consumibles. En una base
  existente las pone la migración 0021 (solo si la descripción seguía siendo la original).
- **D9:** anula un traslado, un ajuste y una entrega; en Auditoría cada «Anulación de movimiento» pone «Motivo de la anulación»
  justo después del tipo anulado, y el traslado dice «Traslado» (no «Traslado (salida)») y no trae «Recibe —» ni «Motivo del
  movimiento —». Los eventos ya guardados no se reescriben (Q75).
- **D10:** en Auditoría, «Devolución» y la anulación de una devolución traen «Entrega: Entrega del dd-mm-aaaa HH:mm a <receptor>».
- **D11 y D12:** Auditoría, entidad «Categoría»: el alta o la edición de una categoría de consumibles no muestra «Tipo de
  extensión» (la de activos sí). Crear o renombrar una categoría de consumibles con un nombre repetido: «Ya existe una categoría
  de consumibles con ese nombre».
- **D13:** Catálogo → Categorías de consumibles (o Unidades de medida) con consumibles asociados: al renombrar (editar) o
  desactivar, la confirmación trae «Afecta a N consumibles» destacado. Sin consumibles no pregunta.
- **D15:** traslado (historial, su anulación, el diálogo «Anular», Inicio → «Últimos movimientos»): título «Traslado 5 unidades»
  y debajo «Bodega Anexo → Bodega Cristobal Gambi» con nombres cortos; pasa el cursor sobre la ruta para ver las completas.
- **D16:** una bodega con mínimo 5 y 2 en stock avisa; al desactivar la bodega desaparece el aviso (insignia, alerta de la
  ficha, Inicio y filtro «Bajo mínimo»); en «Stock por bodega» el mínimo se ve atenuado con «(bodega inactiva)».
- **D17:** abre cualquier selector de bodega: el buscador dice «Buscar bodega…».
- **D18:** edita los mínimos por bodega de un consumible; en Auditoría solo salen las bodegas que cambiaron, una línea cada una
  («Bodega Cristobal Gambi: — → 40», «Bodega Anexo: 40 → —»).
- **D19:** «Stock por bodega» (tabla y tarjetas a 360 px): el nombre de la bodega es el título y la ruta de los padres va debajo,
  más chica.
- **D20:** historial a 360 px: un botón «Filtros» y los activos como chips (en escritorio, la barra de Activos y Auditoría).
- **D21:** a 360 px, «Ir al movimiento» no se parte en dos líneas.
- **D22:** Inicio: el bloque dice «Activos disponibles por bodega».
- **D23:** abre «Asignar activo»: Persona no está en rojo; pulsa «Asignar» sin elegir: aparece «Este campo es obligatorio»; elige
  una persona: desaparece. `dialogErrors.test.ts` lo comprueba con asignar, devolver, cambiar estado, dar de baja y editar.
- **e2e (Playwright + axe, escritorio y 360 px):** D5 en `admin.spec.ts`; D14 y D15 en `consumables.spec.ts`; D16 es un caso
  nuevo de `consumables.spec.ts`; D22 en `home-dashboard.spec.ts`; D23 en `inventory.spec.ts`.

### Backlog de la revisión 2

Fuera de alcance; **no se implementa**.

- El encabezado de la ficha de un activo asignado muestra «Con <persona> · <persona>»: ubicación y asignado repiten el nombre.

### Backlog post-F3.5

Fuera de alcance de F3.5; **no se implementa**.

- Importación CSV de ingresos.
- Exportación de stock.
- Costos y valorización del stock.
- Lotes y vencimientos.
- Notificaciones por correo del stock mínimo.
- Prueba con lector de pantalla real (NVDA, VoiceOver, TalkBack) de los diálogos, los selectores de bodega y el historial de consumibles: hoy solo hay axe y pruebas de roles y nombres accesibles.
- **Error a 360 px en Consumibles (fix suelto antes de abrir la beta, sección 13 del requerimiento).** El listado en tarjetas
  tiene scroll horizontal y corta el contenido por la izquierda: el nombre del consumible no se ve. Viola la regla de 360 px sin
  scroll horizontal (RF-40); el e2e existente no lo detectó porque no tenía el aviso largo.
  - Causa probable (sin verificar): el aviso «Bajo mínimo global · N bodega(s) bajo mínimo» no se parte en líneas y ensancha
    la tarjeta.
  - Arreglo propuesto: permitir salto de línea en el aviso (o dos avisos apilados), `min-w-0` en la tarjeta y un e2e a 360 px
    con ese caso que verifique `scrollWidth <= clientWidth`.
  - Revisar el mismo patrón en Inicio y en la ficha del consumible.

## F3.5 revisión 3

Tercera revisión manual del PR #7. Un commit por punto; cada punto se marca aquí junto con su commit.

- [x] R1 Roles: la descripción se ajusta a 2 líneas (texto completo en tooltip) y la tabla no desborda en escritorio
- [x] R2 Confirmación del ajuste: «solo quien tenga permiso para anular movimientos puede anularlo»
- [x] R3 Diálogo «Anular movimiento»: líneas de saldo con nombre corto de bodega y ruta en tooltip
- [x] R4 Historial e Inicio: línea de bodega con nombre corto y ruta en tooltip en todos los tipos
- [x] R5 «Cambiar estado» no ofrece ni acepta estados de baja; la única vía es «Dar de baja»
- [x] R6 Auditoría de una devolución: «Identificador de quien devolvió»

### Cómo probar la revisión 3

- **R1:** Roles en escritorio (1280, 1024 y 768 px): la descripción ocupa hasta 2 líneas (el texto completo sale al pasar el
  cursor) y la columna «Usuarios» y las acciones se ven sin scroll horizontal. e2e: `admin.spec.ts` («roles (R1)»).
- **R2:** registra un ajuste y mira la confirmación: «Queda en el libro y no se puede editar; solo quien tenga permiso para
  anular movimientos puede anularlo.»
- **R3:** anula un movimiento de una bodega anidada: las líneas dicen «En Bodega X el stock pasará de…» con el nombre corto;
  la ruta completa sale al pasar el cursor.
- **R4:** historial de un consumible e Inicio → «Últimos movimientos», con ingreso, entrega, devolución, ajuste y anulaciones:
  la línea de bodega es el nombre corto (una sola línea a 360 px) y la ruta completa va en el tooltip. Auditoría sigue con la
  ruta. e2e: `consumables.spec.ts` («R4»).
- **R5:** ficha de un activo → «Cambiar estado»: el selector no ofrece «Dado de baja» (tampoco en Editar/alta, alta en lote
  ni «Devolver»). Por API, `POST /assets/:id/status` con un estado de tipo archivado responde 422 («Para dar de baja un activo
  usa «Dar de baja»»). La baja sigue por «Dar de baja» con motivo. Pruebas: `assets.int.test.ts`, `AssetActionDialog.test.ts` y
  e2e `inventory.spec.ts` (decisión Q83 en `open-questions.md`).
- **R6:** Auditoría de una devolución (y de la anulación de una devolución): «Identificador de quien devolvió»; en la entrega
  sigue «Identificador del receptor».

### Backlog de la revisión 3

Fuera de alcance; **no se implementa**.

- El filtro «Bodega» del historial (D20) es un menú simple sin búsqueda; con muchas bodegas convendrá el selector con búsqueda.

## Fix ubicación

Arreglo previo a F4, rama `fix/filtro-ubicacion-jerarquico`. El filtro «Ubicación» de la barra filtraba por la bodega base, pero
su selector ofrecía todas las ubicaciones, y no incluía sububicaciones. Un commit por punto; cada punto se marca junto con su commit.

- [x] Un U4 Consulta recursiva a prueba de ciclos (CYCLE) y 422 claro al crear un ciclo, con tests de ambos
- [x] Un U3 Filtro `locationId` (ubicación actual) incluye todas las sububicaciones, sin límite de profundidad
- [x] Un U1 Filtro principal «Ubicación actual» en la barra; los asignados a una persona no entran
- [x] Un U2 «Bodega base» pasa a «Más filtros», solo bodegas, y su filtro `baseLocationId` incluye sububicaciones
- [x] Un U5 Chips explícitos: «Ubicación actual: Chile (incluye sububicaciones)» y «Bodega base: …»
- [x] Un U6 Columna «Ubicación» (listado y ficha): nombre corto, ruta completa en tooltip, «Con <persona>»
- [x] Un U7 Selectores de ubicación con buscador «Buscar ubicación…» y dos líneas (patrón de WarehouseSelect)
- [x] Un U8 Exportación CSV y API respetan los filtros nuevos; compatibilidad de parámetros registrada
- [x] Un U9 Tests: árbol de 5+ niveles con rama hermana, rendimiento (500 ubicaciones, 2.000 activos) y e2e

### Resumen del arreglo

- **Causa:** el filtro «Ubicación» de la barra era `baseLocationId` (siempre una bodega, RF-20) con un selector de todas las
  ubicaciones, y los dos filtros comparaban por igualdad exacta: filtrar por un sitio de cliente o por un padre daba 0.
- **Ahora:** «Ubicación actual» (`locationId`, dónde está hoy: sitio o su bodega) es el filtro de la barra; «Bodega base»
  (`baseLocationId`) está en «Filtros» y solo ofrece bodegas. Ambos incluyen todas las sububicaciones con una subconsulta
  `WITH RECURSIVE … CYCLE` (`core/db/location-tree.ts`), sin joins de N niveles y sin riesgo de bucle.
- **Ciclos:** la «Ubicación superior» que cree un ciclo (incluida ella misma) responde 422 (ya existía, ahora con test del
  mensaje); `subtreeIds` usaba `UNION ALL` y habría girado sin fin con datos cíclicos.
- **Ruta:** el listado y la ficha traen `location.path`. Se resuelve en una consulta aparte solo para las filas de la página:
  como subconsulta del `SELECT` se evaluaba antes del `OFFSET` y la «página profunda» pasó de ~85 ms a >30 s (lo detectó el
  test de rendimiento de RNF-06).
- **Rendimiento** (500 ubicaciones en 6 niveles, 2.000 activos, 60 muestras, `inject`): p95 de 77 a 106 ms en los seis casos
  (raíz, nivel 2, hoja, bodega base y combinados), dentro de los 300 ms. Los 10.000 activos de RNF-06 siguen dentro del
  presupuesto (p95 ≤ 116 ms).
- **UI:** chips explícitos, columna «Ubicación» con nombre corto y ruta en tooltip, `LocationSelect` con «Buscar ubicación…»
  y dos líneas (nombre y ruta) en alta, lote, asignar y devolver; los filtros usan el mismo patrón.

### Decisiones provisionales del arreglo

Q85 a Q89 en `open-questions.md`: parámetros de la API sin renombrar (solo más alcance), conteo del Inicio por bodega exacta,
aviso «incluye sububicaciones» en ambos chips (corregido en la revisión del PR #8), quién entra en «Ubicación actual», y casos límite (ciclos ya presentes, tipos).

### Cómo probar el arreglo

- **API:** `pnpm --filter @inventarius/api test:int -- assets.location` (árbol de 6 niveles con rama hermana, ciclo en los
  datos, CSV, ruta) y `catalog.int` (ciclos al cambiar el padre).
- **Manual:** crea Chile › Cliente › Edificio › Piso › Sala; asigna un activo a «Sala». En Activos filtra por «Ubicación
  actual» = Sala y luego = Chile: aparece en ambos, con el chip «(incluye sububicaciones)» y la ruta en el tooltip de la
  columna. Un activo asignado a una persona no aparece. «Filtros» → «Bodega base» solo lista bodegas.
- **e2e:** `e2e/tests/location-filter.spec.ts` (escritorio y 360 px) y los ajustes en `filters-menu.spec.ts` e `inventory.spec.ts`.

### Revisión del PR #8

- F1: «Ubicación superior» al editar una ubicación no ofrece la propia ni su subárbol (a cualquier profundidad): la API acepta
  `excludeSubtreeOf` en `GET /locations` y el formulario lo usa. La validación al guardar y el 422 siguen como defensa.
  Pruebas: `catalog.int.test.ts` y `CatalogFormDialog.test.ts` (editar «Chile» no ofrece Chile, Lafquen, Parcela h22 ni Santiago).
- F2: el chip de «Bodega base» también dice «(incluye sububicaciones)» (`assetFilters.test.ts`).

## Requisitos v2

PR solo de documentación (rama `docs/requisitos-v2`, desde `main` en `182791d`). Sin código de la app ni migraciones.

- [x] Tarea 1: reglas «Herramientas y entorno» en `CLAUDE.md` y lectura de `.env.example` en `.claude/settings.json`
- [x] Tarea 2: «Requisitos v2» en `docs/requirements.md` (RF-80 en adelante)
- [x] Tarea 3: preguntas abiertas (Q90 en adelante) y backlog de Consumibles a 360 px
- [ ] Tarea 4: borradores de ADR (0009 en adelante, estado «Propuesto»)
- [ ] Tarea 5: plan de entrega (sección 13 de `docs/requirements.md`)

Notas de la tarea 1:

- `.claude/settings.json` no se cambió: desde `0e95a9e` la regla `.env*` ya no existe (se deniegan `.env`, `.env.local`,
  `.env.production`, `.env.development` y `.env.test`), `.env.example` se leyó con `Read` en esta sesión y
  `apps/web/.env.example` no existe ni quedaría bloqueado. `gh api` sigue denegado. Con esto Q32 deja de aplicar.
- Fuera de lo pedido: se ajustaron dos líneas previas de `CLAUDE.md` que chocaban con las reglas nuevas (la de «antes de cada
  commit» remite a la regla 7; la de checks en rojo aclara qué pasa cuando el prompt no pide esperar el CI).
