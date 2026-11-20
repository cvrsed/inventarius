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
    // El hover por defecto del botón sólido (primario al 75 %) baja el contraste del texto a 3,35:1 (axe, WCAG AA 4,5:1).
    // Se oscurece en claro y se aclara en oscuro en lugar de mezclar con el fondo.
    compoundVariants: [
      {
        color: 'primary',
        variant: 'solid',
        class: 'hover:bg-(--ui-color-primary-800) dark:hover:bg-(--ui-color-primary-300)',
      },
    ],
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
  'lucide:circle-user',
  'lucide:ellipsis',
  'lucide:layers',
  'lucide:x',
  'lucide:log-out',
  'lucide:sun',
  'lucide:moon',
  'lucide:plus',
  'lucide:pencil',
  'lucide:trash-2',
  'lucide:unlink',
  'lucide:copy',
  'lucide:refresh-cw',
  'lucide:eye',
  'lucide:eye-off',
  'lucide:chevron-right',
  'lucide:chevron-down',
  'lucide:box',
  'lucide:triangle-alert',
  'lucide:package',
  'lucide:boxes',
  'lucide:package-plus',
  'lucide:package-minus',
  'lucide:hand-helping',
  'lucide:ban',
  'lucide:scale',
  'lucide:library',
  'lucide:download',
  'lucide:arrow-up',
  'lucide:arrow-down',
  'lucide:arrow-up-down',
  'lucide:user-plus',
  'lucide:undo-2',
  'lucide:arrow-left',
  'lucide:arrow-right-left',
  'lucide:archive',
  'lucide:archive-restore',
  'lucide:list-filter',
  'lucide:wifi-off',
  'lucide:map-pin',
  'lucide:radio-tower',
  'lucide:plug-zap',
  'lucide:file-up',
  'lucide:file-check',
  'lucide:link',
  // Ya se usaban (orden del listado y buscador) pero no estaban empaquetados: se pedirían a un dominio externo.
  'lucide:arrow-down-wide-narrow',
  'lucide:arrow-up-narrow-wide',
  'lucide:search',
] as const;
