# ADR 0003 — UI con PrimeVue en modo styled, en lugar de Volt

- Estado: **Reemplazado por [0004](0004-ui-nuxt-ui-v4.md)**
- Fecha: 2026-11-16

## Contexto
La propuesta inicial (el proveedor del stack sugerido) fue Vue + Volt. Volt no se instala como librería: cada componente es un
wrapper sobre PrimeVue sin estilos, con clases Tailwind, que se copia al repositorio con su CLI y desde ahí
pasa a ser código propio.

## Decisión
Usar PrimeVue en modo styled, instalado por npm, con el tema Aura personalizado por design tokens
(`definePreset`). Tailwind CSS v4 (+ `tailwindcss-primeui`) se mantiene solo para layout y espaciado.
Se conservan Vue y la base de componentes PrimeVue de la propuesta original; cambia solo cómo se consumen.

## Motivos
1. Actualizaciones: las correcciones de PrimeVue (bugs, accesibilidad, seguridad) llegan por Renovate,
   quedan trabadas en el lockfile y pasan por CI. Con Volt habría que aplicarlas a mano en cada copia (RNF-09, RNF-10).
2. Código a mantener: el repo guarda solo código propio y un preset de tema, no decenas de componentes de terceros.
3. Sistema de diseño: los design tokens centralizan color, tipografía, espaciado y modo oscuro (RNF-01).
4. Trabajo con agentes: sin librería copiada en el repo, no hay deriva por "arreglos" locales a componentes.
5. Traspaso: quien reciba el proyecto recibe dependencias declaradas y versionadas, no un fork.

## Costos aceptados
Menos control fino del markup; el aspecto tiende al de PrimeVue si no se trabaja el preset; algo más de CSS
en runtime. Casos puntuales se resuelven con la API pass-through (`pt`), sin copiar componentes.

## Reversibilidad
Alta: Volt usa los mismos componentes PrimeVue por debajo; un componente puntual puede migrarse a Volt sin rehacer la app.
