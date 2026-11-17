# ADR 0006 — Node 24 LTS y bases Debian 13 (política de versiones)

- Estado: aceptada (reemplaza la decisión D1 de Node 26 del ADR 0002)
- Fecha: 2026-11-17

## Contexto

La organización fija una política de versiones para todos sus proyectos: **Node 24 LTS** y **Debian 13 (trixie)** como base
de las imágenes. El ADR 0002 había elegido Node 26 (decisión D1) porque todo el stack funcionaba en él. Mantener dos
versiones de Node entre proyectos complica el soporte y los parches de seguridad.

## Decisión

- **Runtime: Node 24 LTS (24.22.3).** `.nvmrc` y `engines` (`>=24.22.0`), imagen base `node:24-trixie-slim` fijada por
  digest (`Dockerfile`) y documentación (`docs/development.md`, `docs/requirements.md` sección 7.2).
- **CI:** la matriz sigue probando **24.22.3 y 26**. La 26 es solo una alerta temprana de compatibilidad con la siguiente
  versión; no es el runtime y su fallo no cambia lo que se despliega.
- Un cambio de versión mayor de Node es una tarea explícita, con su PR, no una actualización automática.
- **Imágenes basadas en Debian 13, con la variante explícita:** `node:24-trixie-slim` y `postgres:18-trixie`, ambas fijadas
  por digest. La etiqueta `postgres:18` ya resolvía a trixie (mismo digest, 18.7); la variante explícita evita que un cambio
  futuro de la etiqueta por defecto cambie la distribución sin que nadie lo note.
- **Excepciones justificadas:**
  - **Caddy (`caddy:2-alpine`, 2.11.9):** Caddy es un binario estático en Go sin dependencias del sistema; la imagen
    oficial de Alpine es la más pequeña y su única función es servir la SPA y proxyar `/api`. No hay variante Debian oficial
    mantenida por el proyecto. Se mantiene fijada por digest y la escanea Trivy.
  - **Playwright (`mcr.microsoft.com/playwright:v…-noble`, Ubuntu 24.04):** solo se usa para las pruebas e2e, nunca se
    despliega. Los navegadores y sus dependencias del sistema solo se publican oficialmente sobre Ubuntu; la versión del tag
    debe ser igual a la del paquete `@playwright/test` (`scripts/check-playwright-version.mjs`).

## Consecuencias

- Las dependencias con binarios nativos (`argon2`) se prueban en Node 24 en los tests unitarios, de integración y e2e.
- Se pierde el soporte más largo de Node 26 (abril 2029): el de Node 24 llega hasta abril 2028. La revisión de versión
  se hace antes de esa fecha.
