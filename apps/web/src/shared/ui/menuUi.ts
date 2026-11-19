/**
 * Aspecto del panel desplegable de los menús con opciones (SelectMenu). El panel de un filtro no hereda el ancho del
 * botón: entre 280 y 400 px, y los textos largos pasan a 2 líneas en lugar de recortarse con «…» (RNF-02).
 */
export const COMPACT_MENU_UI = {
  content: 'w-auto min-w-[280px] max-w-[400px]',
  itemLabel: 'text-clip whitespace-normal break-words',
  itemDescription: 'text-clip whitespace-normal break-words',
} as const;

/** En formularios el panel mide lo que el campo, pero igualmente envuelve los textos largos. */
export const WRAPPED_MENU_UI = {
  itemLabel: 'text-clip whitespace-normal break-words',
  itemDescription: 'text-clip whitespace-normal break-words',
} as const;

/** Que el panel se alinee al borde del botón y no se salga de la pantalla (deja 8 px de margen). */
export const MENU_CONTENT = { align: 'start', collisionPadding: 8 } as const;
