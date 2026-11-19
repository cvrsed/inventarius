import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installErrorHandling } from './errorHandling';

const uninstall: (() => void)[] = [];
afterEach(() => uninstall.splice(0).forEach((u) => u()));

function setup(extra: { quietMs?: number; hardNavigate?: (p: string) => void } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => h('p', 'inicio') } },
      {
        path: '/rota',
        component: () =>
          Promise.reject(new Error('Failed to fetch dynamically imported module: /x.js')),
      },
      {
        path: '/guard',
        component: { render: () => h('p', 'x') },
        beforeEnter: () => {
          throw new Error('guard roto');
        },
      },
    ],
  });
  const app = createApp({ render: () => h('div') });
  const notify = vi.fn();
  const log = vi.fn();
  uninstall.push(installErrorHandling(app, router, { notify, log, ...extra }));
  return { app, router, notify, log };
}

describe('manejo global de errores (RNF-02)', () => {
  it('un error de render de Vue se registra y se avisa', async () => {
    const { app, notify, log } = setup();
    const handler = app.config.errorHandler!;
    handler(new TypeError('x'), null, 'render function');
    expect(log).toHaveBeenCalledWith('[vue: render function]', expect.any(TypeError));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('un error de navegación del router se registra y se avisa', async () => {
    const { router, notify, log } = setup();
    await router.push('/guard').catch(() => undefined);
    expect(log).toHaveBeenCalledWith('[router]', expect.any(Error));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('un módulo que ya no existe tras un despliegue recarga la página en la ruta pedida', async () => {
    const hardNavigate = vi.fn();
    const { router } = setup({ hardNavigate });
    await router.push('/rota').catch(() => undefined);
    expect(hardNavigate).toHaveBeenCalledWith('/rota');
  });

  it('una promesa rechazada sin captura se registra y se avisa', async () => {
    const { notify, log } = setup();
    const ev = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.assign(ev, { reason: new Error('rechazo') });
    window.dispatchEvent(ev);
    await nextTick();
    expect(log).toHaveBeenCalledWith('[promesa]', expect.any(Error));
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('un error en bucle no apila avisos dentro de la ventana de silencio', () => {
    const { app, notify } = setup({ quietMs: 1000 });
    const handler = app.config.errorHandler!;
    handler(new Error('a'), null, 'x');
    handler(new Error('b'), null, 'x');
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
