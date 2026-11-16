import { onBeforeUnmount } from 'vue';

/**
 * Mientras un listbox de reka-ui está abierto, deja el resto de la página con `aria-hidden` pero con
 * elementos aún enfocables (axe: aria-hidden-focus). El fondo se marca `inert`, que es lo que ocurre de
 * hecho: el foco queda atrapado en el listbox (ADR 0004). El listbox va en un portal fuera de `#app`.
 */
export function useInertWhileOpen(): (open: boolean) => void {
  const appRoot = () => document.getElementById('app');
  onBeforeUnmount(() => appRoot()?.removeAttribute('inert'));
  return (open) => appRoot()?.toggleAttribute('inert', open);
}
