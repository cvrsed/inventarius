export interface ShutdownOptions {
  /** Tope del apagado ordenado; pasado este tiempo el proceso termina igual. */
  timeoutMs: number;
  log: { info(msg: string): void; error(obj: object, msg: string): void };
  exit: (code: number) => void;
}

/**
 * Apagado ordenado con tope de tiempo: ejecuta `close` y termina el proceso con código 0 si acabó a tiempo.
 * Si falla o excede `timeoutMs` (una consulta colgada, una conexión que no cierra) termina con código 1, para
 * que un `SIGTERM` nunca deje el proceso vivo hasta el `SIGKILL` del orquestador.
 */
export async function shutdown(close: () => Promise<void>, opts: ShutdownOptions): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const outcome = await Promise.race([
    close().then(
      () => 'ok' as const,
      (err: unknown) => {
        opts.log.error({ err }, 'error durante el apagado');
        return 'error' as const;
      },
    ),
    new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), opts.timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  if (outcome === 'timeout') {
    opts.log.error({ timeoutMs: opts.timeoutMs }, 'el apagado excedió su tope; se termina igual');
  }
  opts.exit(outcome === 'ok' ? 0 : 1);
}
