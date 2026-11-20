import type { ConnectionCheckDto } from '@inventarius/shared';

/**
 * Detalle de «Probar conexión». Si todas las verificaciones fallaron por la misma causa (p. ej. credencial inválida o
 * servidor caído) devuelve ese único mensaje; el detalle por elemento solo aparece cuando los resultados difieren.
 */
export function failureDetail(
  checks: ConnectionCheckDto['checks'],
  label: (name: string) => string,
): string {
  const failed = checks.filter((c) => !c.ok);
  if (failed.length === 0) return '';
  const causes = new Set(failed.map((c) => c.detail ?? ''));
  if (failed.length === checks.length && causes.size === 1) return [...causes][0]!;
  return failed.map((c) => `${label(c.name)}: ${c.detail ?? ''}`).join(' · ');
}
