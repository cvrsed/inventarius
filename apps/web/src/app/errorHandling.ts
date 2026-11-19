import type { App } from 'vue';
import type { Router } from 'vue-router';

export interface ErrorHandlingOptions {
  /** Muestra el aviso al usuario (un toast). */
  notify: () => void;
  /** Registro del error; por defecto `console.error`. */
  log?: (...args: unknown[]) => void;
  /** Recarga completa hacia una ruta (cuando falla la descarga de un módulo tras un despliegue nuevo). */
  hardNavigate?: (fullPath: string) => void;
  /** Ventana (ms) en que no se repite el aviso, para que un error en bucle no apile toasts. */
  quietMs?: number;
  now?: () => number;
}

/** Falla de `import()` dinámico: la pestaña tiene una versión vieja y el módulo ya no existe. */
const isChunkLoadError = (e: unknown): boolean =>
  e instanceof Error &&
  /dynamically imported module|Importing a module script failed|Loading chunk/i.test(e.message);

/**
 * Último recurso para que ninguna falla deje la app congelada en silencio (RNF-02): los errores de render o de
 * eventos de Vue, de la navegación del router y las promesas rechazadas sin captura se registran y se avisan.
 * Una navegación que falla por un módulo viejo se rehace como carga completa de la página.
 * Devuelve una función que desinstala el oyente global.
 */
export function installErrorHandling(
  app: App,
  router: Router,
  opts: ErrorHandlingOptions,
): () => void {
  // eslint-disable-next-line no-console -- único lugar donde registrar un error inesperado es la consola del navegador
  const log = opts.log ?? ((...a: unknown[]) => console.error(...a));
  const now = opts.now ?? Date.now;
  const quietMs = opts.quietMs ?? 4000;
  let lastNotice = -Infinity;
  const report = (where: string, error: unknown): void => {
    log(`[${where}]`, error);
    if (now() - lastNotice < quietMs) return;
    lastNotice = now();
    opts.notify();
  };

  app.config.errorHandler = (error, _instance, info) => report(`vue: ${info}`, error);
  router.onError((error, to) => {
    report('router', error);
    if (isChunkLoadError(error))
      (opts.hardNavigate ?? ((p) => window.location.assign(p)))(to.fullPath);
  });
  const onRejection = (event: PromiseRejectionEvent) => report('promesa', event.reason);
  window.addEventListener('unhandledrejection', onRejection);
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
