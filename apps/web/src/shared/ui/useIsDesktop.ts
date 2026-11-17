import { onBeforeUnmount, ref } from 'vue';

const QUERY = '(min-width: 768px)';

/** `true` desde 768 px (Tailwind `md`). Reactivo: sigue los cambios de tamaño de la ventana. */
export function useIsDesktop() {
  const media = window.matchMedia(QUERY);
  const isDesktop = ref(media.matches);
  const onChange = (e: MediaQueryListEvent) => (isDesktop.value = e.matches);
  media.addEventListener?.('change', onChange);
  onBeforeUnmount(() => media.removeEventListener?.('change', onChange));
  return isDesktop;
}
