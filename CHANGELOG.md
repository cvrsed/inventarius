# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Desde v1.0.0 lo genera release-please
(sección 11.3); hasta entonces se mantiene a mano al cerrar cada fase.

## [Sin publicar]

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
- Frontend Vue + PrimeVue (Aura personalizado por tokens) + Tailwind v4 + i18n es-CL, modo claro/oscuro y layout
  responsivo desde 360 px (RNF-01, RNF-03, RNF-05, RF-40).
- Vitest (shared, api, web), integración con Postgres 18 real (Testcontainers) y Playwright + axe en Docker.
- `compose.yml` de desarrollo, `compose.e2e.yml`, Dockerfile multi-etapa con imágenes por digest.
- CI en GitHub Actions y Renovate.
- ADRs 0001 (monolito modular) y 0002 (stack y versiones).
