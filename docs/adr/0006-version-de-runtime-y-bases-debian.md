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

## Consecuencias

- Las dependencias con binarios nativos (`argon2`) se prueban en Node 24 en los tests unitarios, de integración y e2e.
- Se pierde el soporte más largo de Node 26 (abril 2029): el de Node 24 llega hasta abril 2028. La revisión de versión
  se hace antes de esa fecha.
