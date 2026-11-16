/**
 * Segundos de bloqueo tras `failures` intentos fallidos consecutivos: 0 bajo el umbral,
 * `baseSeconds` al alcanzarlo y el doble por cada fallo adicional, con tope.
 */
export function lockSeconds(
  failures: number,
  opts: { max: number; baseSeconds: number; capSeconds: number },
): number {
  if (failures < opts.max) return 0;
  const exponent = Math.min(failures - opts.max, 30);
  return Math.min(opts.baseSeconds * 2 ** exponent, opts.capSeconds);
}
