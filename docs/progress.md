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
`pnpm lint && pnpm typecheck && pnpm test`; `pnpm test:coverage`; e2e con `compose.e2e.yml`.

**Aprendizajes**: `up --exit-code-from` aborta con servicios one-shot; `npm i -g pnpm --ignore-scripts` deja un `pnpm` no ejecutable por `exec`; axe detectó contraste insuficiente en los mensajes de Aura (corregido en el preset).

## Plan F1 — Identidad (rama `phase/f1-identidad`, apilada sobre F0)

Se detalla al empezar F1.
