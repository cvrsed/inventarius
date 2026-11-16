// jsdom no implementa matchMedia (Nuxt UI/reka-ui lo consultan para adaptar los componentes).
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

if (typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

// reka-ui (base de Nuxt UI) usa estas APIs del DOM, que jsdom no trae.
const elementProto = Element.prototype as unknown as Record<string, unknown>;
for (const name of [
  'scrollIntoView',
  'hasPointerCapture',
  'setPointerCapture',
  'releasePointerCapture',
]) {
  if (typeof elementProto[name] !== 'function') elementProto[name] = () => false;
}
