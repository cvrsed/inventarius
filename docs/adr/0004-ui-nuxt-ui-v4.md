# ADR 0004 — UI con Nuxt UI v4 (modo Vue + Vite)

- Estado: aceptada
- Fecha: 2026-11-16
- Reemplaza a: [0003](0003-ui-primevue-styled.md)

## Contexto

El ADR 0003 eligió PrimeVue 4 en modo styled. Desde la versión 5, PrimeVue y todo PrimeTek (incluido Volt) pasaron de
MIT a la «PrimeUI License»: exigen una clave de licencia, y la versión gratuita (Community) solo cubre organizaciones
con menos de USD 1 M de ingresos, menos de 5 desarrolladores y menos de 10 empleados, con renovación anual. La rama 4.x
(MIT) queda sin evolución. Eso choca con RNF-08 (portabilidad a otras organizaciones): Inventarius debe poder
instalarlo cualquier empresa sin condiciones de licencia de un tercero. La decisión de migrar es del responsable del proyecto.

## Decisión

Usar **Nuxt UI v4** (MIT) en modo Vue + Vite, sin Nuxt: plugin `@nuxt/ui/vite` y `@nuxt/ui/vue-plugin`. Es una capa
de componentes sobre `reka-ui` (MIT, accesibilidad de Radix para Vue), Tailwind CSS v4 y `tailwind-variants`.

- Versión **4.12.0**, exacta en el lockfile. Las 4.12.1 y 4.12.2 se publicaron el mismo día de la migración y quedan
  bajo la política de antigüedad mínima de pnpm; no se agregó ninguna excepción.
- Los componentes se **importan de forma explícita** (`@nuxt/ui/components/Button.vue`), sin auto-import ni archivos
  `.d.ts` generados: `pnpm typecheck` no depende de haber corrido Vite antes.
- **Tema por design tokens en un solo lugar**, `apps/web/src/theme/`: `theme.ts` (paleta, tamaño por defecto,
  objetivo táctil de 44 px, lista de íconos) y `theme.css` (tipografía, radios, contraste AA, modo oscuro).
  Tailwind queda solo para layout y espaciado. Cambiar la identidad visual = editar esos dos archivos.
- **Modo claro/oscuro** propio (`useThemeStore`, clase `dark` en `<html>`, preferencia en `localStorage`):
  `colorMode: false` en el plugin.
- **Íconos Lucide empaquetados**: `@iconify-json/lucide` (ISC) más `icon.clientBundle.icons` en `vite.config.ts` los
  incluyen en el build. `main.ts` deja a Iconify **sin proveedores** (`addAPIProvider('', { resources: [] })`), así
  que nunca consulta a `api.iconify.design` y una CSP estricta (`connect-src 'self'`) se mantiene. Un e2e recorre las
  pantallas y falla si hay una sola petición a otro origen. Dependencia directa: `@iconify/vue`.
- **Textos**: locale `es` de Nuxt UI para los textos internos de la librería y `vue-i18n` (es-CL) para los nuestros.
- **Confirmaciones**: Nuxt UI no trae servicio de confirmación; `shared/ui/useConfirm` + `ConfirmDialog` (sobre
  `UModal`) cumplen ese papel, montados una vez en `App.vue`.
- **Tablas**: `UTable` (TanStack Table) con paginación y filtros **del lado servidor** (`shared/ui/PagedFooter`,
  `UPagination`, filtros que consultan la API).

Ninguna dependencia de PrimeTek queda en `package.json` ni en `pnpm-lock.yaml` (`primevue`, `@primeuix/*`,
`primeicons`, `tailwindcss-primeui` eliminadas).

## Consecuencias y costos aceptados

- **Tabla menos completa** que el `DataTable` de PrimeVue: no trae paginador ni filtros ni modo apilado en móvil.
  Se arman sobre `UTable`/TanStack (`PagedFooter`, filas expandibles con un botón propio). En 360 px la tabla
  desplaza horizontalmente dentro de su contenedor, no la página.
- **`exactOptionalPropertyTypes` desactivado solo en `apps/web`**: los tipos de Nuxt UI declaran props opcionales sin
  `| undefined`. El resto del monorepo lo mantiene activo.
- **Condición de exports renombrada** de `source` a `inventarius-source`: Nuxt UI y sus dependencias también publican
  una condición `source` (TypeScript de su fuente) y con el nombre genérico `tsc` terminaba compilando código de
  terceros.
- **Selects**: el listbox de reka-ui deja el resto de la página con `aria-hidden` mientras está abierto y axe marca
  `aria-hidden-focus` fuera de un diálogo modal. `shared/ui/AppSelect` marca el fondo `inert` mientras está abierto
  (el foco ya está atrapado en el listbox) y traduce el valor vacío, que reka-ui no admite en opciones.
- **Colores**: los tonos por defecto de Nuxt UI no llegan a 4,5:1 en variantes suaves; `theme.css` fija el tono 700
  (marca) u 800 (estado) en claro y 400 en oscuro, y oscurece el texto atenuado (RNF-02).
- Superficie de dependencias mayor: Nuxt UI arrastra `reka-ui`, `@vueuse/core`, `tailwind-variants`, `fuse.js`,
  `@tanstack/vue-table`, entre otras. Se auditan igual (OSV, Trivy) y no hay excepciones nuevas.
- Se pierde la opción de usar Volt como vía de escape; la equivalente es `reka-ui` directamente, ya presente.

## Reversibilidad

Media. Las pantallas importan componentes `U*` en pocos lugares y el comportamiento vive en composables y servicios
sin dependencia de la librería de UI (reglas de CLAUDE.md), así que reemplazar la librería afecta plantillas y el
tema, no la lógica. Si PrimeTek volviera a una licencia permisiva, o si otra librería (reka-ui sola, Ark UI) resultara
mejor, el costo sería de unos días: reescribir las plantillas y `theme/`. Los textos, i18n, guards, API y tests de
lógica no cambian.

## Alternativas descartadas

- **PrimeVue 5 / Volt con licencia Community**: condiciona a cada organización que instale Inventarius.
- **PrimeVue 4.5.x (MIT) congelado**: sin evolución ni correcciones de seguridad a largo plazo.
- **reka-ui + Tailwind a mano**: máximo control, pero obliga a mantener decenas de componentes propios.
