# Prompt de arranque para Claude Code

Pegar esto como primer mensaje en la sesión de Claude Code, dentro del repo clonado en la VM.

---

Vas a construir Inventarius desde cero. Lee completos, en este orden, antes de escribir código:
`CLAUDE.md`, `docs/requirements.md`, `docs/adr/0003-ui-primevue-styled.md`, `docs/progress.md`.

Esta sesión corre sin supervisión durante varias horas. Autorización para esta sesión:

1. Ejecuta la **Fase F0 (Fundaciones)** completa según la sección 13 del requerimiento,
   en la rama `phase/f0-fundaciones`. Al cumplir su criterio de aceptación, abre el PR hacia `main`.
2. Luego ejecuta la **Fase F1 (Identidad)** en la rama `phase/f1-identidad`, creada **desde
   `phase/f0-fundaciones`** (PR apilado, base = `phase/f0-fundaciones`). Esta es la única excepción
   autorizada a la regla de esperar el merge de la fase anterior.
3. Detente al terminar F1 o si quedas bloqueado en ambas fases. No empieces F2.

Reglas de ejecución:

- Primero un plan corto de F0 en `docs/progress.md` (tareas en checklist), después ejecuta.
- Fija versiones reales y vigentes al momento de instalar (Node, pnpm, Vue, PrimeVue, Fastify 5.x,
  Postgres 18, Drizzle, pg-boss, Vitest, Playwright) y regístralas en `docs/adr/0002-stack.md`.
  Si Node 26 no funciona con alguna dependencia, usa Node 24 LTS y explícalo en el ADR (decisión D1).
- Crea `docs/adr/0001-monolito-modular.md` con la decisión de arquitectura de la sección 7.1.
- Los e2e corren con la imagen oficial de Playwright en Docker, con la misma versión que el paquete.
- CI en GitHub Actions según la sección 11.3 (sin el job de release ni el de LNS real todavía).
- Ante cualquier duda de producto: decisión provisional razonable, anotada en `docs/open-questions.md`, y sigue.
- Al terminar cada fase: `docs/progress.md` actualizado con lo hecho, lo pendiente y cómo probarlo.

Al final, deja en `docs/progress.md` un resumen de la sesión: PRs abiertos, estado de CI,
decisiones provisionales que requieren revisión de Rodrigo y siguiente paso sugerido.
