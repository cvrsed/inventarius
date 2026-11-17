# CLAUDE.md — Inventarius

## Fuente de verdad
- `docs/requirements.md`: requerimiento y diseño del MVP. Si algo no está ahí, no se inventa:
  se anota en `docs/open-questions.md` con la decisión provisional tomada y se sigue.
- `docs/adr/`: decisiones de arquitectura. La 0004 (UI con Nuxt UI v4, MIT) reemplaza a la 0003 (PrimeVue); ya está tomada.
- `docs/progress.md`: estado de avance. Se actualiza al cerrar cada tarea relevante y cada fase.

## Alcance
- Trabajar solo las fases que indique el prompt de arranque (`KICKOFF.md`) o Rodrigo.
- Una fase = una rama `phase/fN-nombre` = un PR hacia `main`.
- Detenerse al completar el MVP (v1.0.0). Nada de items Should/Could sin instrucción explícita.

## Forma de trabajo
- TDD en dominio y servicios: primero el test que falla, después la implementación.
- Commits pequeños, Conventional Commits, mensaje con el porqué y el ID del requerimiento (RF-xx / RNF-xx).
- Antes de cada commit: `pnpm lint && pnpm typecheck && pnpm test`. No se commitea en rojo.
- Nunca push a `main`. Nunca force push. Nunca reescribir historial ya publicado.
- Dependencias: solo las del stack de la sección 7.2. Una dependencia nueva se justifica en el PR.
  Versiones exactas siempre (`save-exact`), lockfile commiteado.
- Secretos: nunca reales en código, tests, fixtures, logs ni commits. Solo `.env.example`.
  No leer ni imprimir `.env`.
- Información sensible: prohibidas en código, comentarios, tests, fixtures, docs y mensajes de commit las IPs internas, hostnames,
  nombres de VMs/CTs, dominios reales, correos reales, nombres de clientes y DevEUI/JoinEUI/AppKey reales. En ejemplos usar
  dominios `example.com`/`.test`, IPs de documentación (`192.0.2.0/24`, `2001:db8::/32`) y datos inventados.
  gitleaks (pre-commit y CI, reglas en `.gitleaks.toml`) lo vigila.
- Toda variable de entorno nueva (en `core/config` o en Caddy/compose) se agrega a `.env.example` en el mismo commit, con un comentario corto.
- Sin `sudo`. Lo que necesite paquetes del sistema corre en contenedores
  (ej. e2e con la imagen oficial de Playwright, versión fijada igual a la del paquete).
- Sin acceso a otras máquinas: nada de `ssh`, `scp`, ni conexiones a IPs de la red local.
- Si algo bloquea de verdad (credencial que falta, decisión de producto), se documenta en
  `docs/open-questions.md`, se deja la tarea marcada en `docs/progress.md` y se sigue con otra.

## Código
- Estructura de módulos: `routes -> service -> repository`. Sin lógica de negocio en rutas ni en componentes Vue.
- TypeScript estricto; sin `any`; errores tipados del dominio mapeados a HTTP en un solo lugar.
- `process.env` solo en `core/config`, validado con Zod al arrancar.
- TSDoc en funciones públicas de servicios y adaptadores. Comentarios solo para explicar decisiones no obvias.
  Nada de código comentado.
- UI: Nuxt UI v4 en modo Vue + Vite, tema propio por design tokens en `apps/web/src/theme` (`theme.ts` y `theme.css`).
  No copiar componentes de la librería. Tailwind solo para layout y espaciado. Íconos Lucide empaquetados en el build
  (nunca pedirlos en runtime a otro dominio). Ninguna dependencia de PrimeTek (PrimeVue, Volt): su licencia exige clave.
- Todo texto de UI por i18n (es-CL). Toda vista revisada en 360 px.

## Al cerrar una fase
- Actualizar `docs/progress.md` (hecho, pendiente, decisiones, preguntas), ADRs, docs de instalación/operación y CHANGELOG.
- Abrir el PR con: resumen, requerimientos cubiertos por ID, cómo probarlo, riesgos conocidos.
