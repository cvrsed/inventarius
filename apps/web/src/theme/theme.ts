/**
 * Tema Inventarius sobre Nuxt UI v4: tokens de diseño en un solo lugar (RNF-01, ADR 0004).
 * Este archivo fija paleta y tamaños; `theme.css` fija tipografía, radios, contraste y modo oscuro.
 * Cambiar la identidad visual = editar estos dos archivos; no se tocan componentes de la librería.
 */
export const uiTheme = {
  colors: {
    primary: 'teal',
    neutral: 'zinc',
  },
  button: {
    slots: {
      // Objetivo táctil de 44 px (WCAG 2.2 AA en móvil, RNF-02).
      base: 'min-h-11 min-w-11 justify-center',
    },
  },
} as const;

/** Tamaño por defecto de controles: `lg` (40 px de alto) en lugar de `md` (32 px). */
export const uiDefaultVariants = { size: 'lg' } as const;

/**
 * Íconos usados en la app, todos de la colección Lucide empaquetada en el build (`@iconify-json/lucide`).
 * Nunca se piden en runtime a api.iconify.design (CSP estricta, RNF-08): el cliente de Iconify se deja sin
 * proveedores en `main.ts` y un e2e verifica que no hay peticiones a otro origen.
 */
export const APP_ICONS = [
  'lucide:house',
  'lucide:users',
  'lucide:shield',
  'lucide:history',
  'lucide:key-round',
  'lucide:log-out',
  'lucide:sun',
  'lucide:moon',
  'lucide:plus',
  'lucide:pencil',
  'lucide:trash-2',
  'lucide:copy',
  'lucide:refresh-cw',
  'lucide:eye',
  'lucide:eye-off',
  'lucide:chevron-right',
  'lucide:chevron-down',
  'lucide:box',
  'lucide:triangle-alert',
] as const;
