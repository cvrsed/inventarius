/** Reloj inyectable: permite probar expiraciones y bloqueos sin esperar. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
