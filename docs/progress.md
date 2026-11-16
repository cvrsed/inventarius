# Progreso

## Estado

| Fase           | Estado    | Rama / PR              |
| -------------- | --------- | ---------------------- |
| F0 Fundaciones | En curso  | `phase/f0-fundaciones` |
| F1 Identidad   | Pendiente | —                      |
| F2 Inventario  | Pendiente | —                      |
| F3 LoRaWAN     | Pendiente | —                      |
| F4 Cierre      | Pendiente | —                      |

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
- [x] Web: Vue + PrimeVue styled con preset propio + Tailwind v4 + i18n es-CL + layout responsivo + modo oscuro
- [x] Vitest (shared 3, api 37 + 8 de integración con Postgres 18 real, web 15), cobertura sobre umbrales
- [x] Playwright + axe en Docker (imagen oficial 1.65.1): 18 tests en escritorio y móvil (360 px), claro y oscuro
- [x] `compose.yml` (dev), `compose.e2e.yml`, Dockerfile multi-etapa, `.env.example`
- [x] CI de GitHub Actions y Renovate (escritos; ver pendiente)
- [x] README, CHANGELOG, `docs/development.md`

**Pendiente / no verificado**

- El workflow de CI **no se ha ejecutado** en GitHub todavía: su primer run real ocurre al abrir el PR. Los jobs `security` (audit/OSV/gitleaks) e `images` (Trivy) no se pudieron probar localmente.
- Ver `docs/open-questions.md` (Q2 PrimeVue 5, Q3 TypeScript 7, Q4 Swagger UI, Q5 cliente generado, Q7 CSP, Q9 primeicons).

**Decisiones**: Node 26.13.1 (D1), PrimeVue 4.5.5, TypeScript 6.0.3, `shared` con exports condicionales (`source`/`default`).

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
- [x] Tests: 117 api (45 de integración con Postgres 18), 56 web, 16 shared; 40 e2e (escritorio y 360 px, axe claro/oscuro)
- [x] Criterios de aceptación: permisos por rol en **todas** las rutas (test que recorre `routeAccess` contra los 4 roles y anónimo),
      test que detecta rutas sin permiso (`assertRouteDeclaresAccess`), login/bloqueo/expiración en e2e

**Pendiente / no verificado**

- Sesiones vencidas solo se purgan al usarse (Q17); no hay job de mantenimiento todavía.
- Panel abierto de `MultiSelect` con checkboxes internos sin etiqueta (Q21).

**Cómo probarlo**: `docs/development.md` (incluye `create-admin`). `pnpm lint && pnpm typecheck && pnpm test:coverage`;
`pnpm --filter @inventarius/api test:int`; e2e con `compose.e2e.yml`. Controles en `docs/security.md`.

## Resumen de la sesión (2026-11-16)

- **PRs abiertos**: #1 `phase/f0-fundaciones` → `main`; #2 `phase/f1-identidad` → `phase/f0-fundaciones` (apilado).
- **CI**: ambos PR terminan con todos los jobs en verde (lint/typecheck, unitarios en Node 26 y 24, integración con cobertura, e2e
  Playwright + axe en Docker, auditoría + OSV + gitleaks, build de imágenes y Trivy). Para llegar ahí hubo que corregir en CI cosas
  que localmente no se veían: `pnpm test` ejecutaba el paquete e2e; zlib desactualizada en la imagen api y `npm` vendorizado
  (con CVEs) que se quitó del runtime; CVE de `x/net` en Caddy sin imagen corregida (`.trivyignore`, Q22); gitleaks 8.24 con
  falsos positivos en contraseñas ficticias de tests (allowlist por ruta); axe leyendo colores a mitad de una transición.
- **Decisiones provisionales que requieren revisión de Rodrigo** (detalle en `docs/open-questions.md`): PrimeVue 4.x en vez de 5 (Q2),
  TypeScript 6 en vez de 7 (Q3), `primeicons` como dependencia nueva (Q9), vulnerabilidades ignoradas (Q11, Q22),
  sesión absoluta de 24 h (Q15, decidida por Rodrigo), umbrales de bloqueo (Q16), roles semilla no borrables ni renombrables (Q13), correo no editable (Q18).
- **Bugs reales que encontraron las pruebas** (corregidos): `--ignore-scripts` dejaba un `pnpm` no ejecutable; `up --exit-code-from`
  abortaba con servicios de un solo uso; contraste AA en mensajes de Aura; `aria-expanded` inválido en el input de contraseña de PrimeVue;
  claves i18n con punto que no resolvían; ruta `/api/metrics` visible tras Caddy.
- **Siguiente paso sugerido**: revisar y mergear #1, luego #2 (cambiar su base a `main`); empezar F2 (Inventario) solo con instrucción explícita.
