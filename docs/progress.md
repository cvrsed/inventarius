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

## Plan F0 — Fundaciones (rama `phase/f0-fundaciones`)

- [ ] Monorepo pnpm (workspaces, `save-exact`, Node/pnpm fijados), TS estricto, ESLint + Prettier, commitlint, lefthook
- [ ] ADR 0001 (monolito modular) y 0002 (stack y versiones reales)
- [ ] `packages/shared` con Zod (esquema de health) y tests
- [ ] API Fastify: config validada con Zod, logger pino con redacción, errores tipados -> RFC 9457, health live/ready, métricas, under-pressure
- [ ] Drizzle + primera migración (extensiones `citext`, tabla `app_meta`), test de integración con Postgres real
- [ ] Worker (entrypoint pg-boss mínimo)
- [ ] Web: Vue + Vite + PrimeVue styled con preset propio + Tailwind v4 + i18n es-CL + layout responsivo (360 px) + modo oscuro
- [ ] Vitest (api, shared, web) con umbrales de cobertura
- [ ] Playwright + axe (móvil y escritorio) en Docker con la imagen oficial
- [ ] `compose.yml` de desarrollo, Dockerfiles, `.env.example`
- [ ] CI GitHub Actions (lint, typecheck, unit, integración, e2e, audit/OSV/gitleaks, build imágenes, Trivy)
- [ ] Docs (README, CHANGELOG), cierre de fase y PR hacia `main`

## Plan F1 — Identidad (rama `phase/f1-identidad`, apilada sobre F0)

Se detalla al cerrar F0.
